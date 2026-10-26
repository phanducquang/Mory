import { randomBytes, randomUUID } from "node:crypto";
import { mkdtemp, rm, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import pg from "pg";
import { S3Client, CreateBucketCommand, DeleteBucketCommand } from "@aws-sdk/client-s3";
import { describe, expect, it, vi } from "vitest";
vi.mock("server-only",()=>({}));
import { createDatabaseClient } from "@/server/db/client";
import { readStorageConfiguration } from "@/server/storage/config";
import { createS3Storage } from "@/server/storage/s3";
import { readEncryptedBackup, writeEncryptedBackup } from "@/server/backup/encryption";
import { createBackup, exportDeletionLedger, restoreBackup } from "@/server/backup/service";
if(process.env.MORY_INTEGRATION_DATABASE!=="disposable-docker")throw new Error("Use disposable DB runner.");
describe.skipIf(process.env.MORY_MEDIA_ENABLED!=="true")("encrypted database and object recovery",()=>{
 it("restores a real snapshot, prunes subsequent deletions, invalidates credentials and rejects unsafe inputs",async()=>{
  const directory=await mkdtemp(path.join(os.tmpdir(),"mory-recovery-")); const key=randomBytes(32);
  const db=createDatabaseClient();const cfg=readStorageConfiguration();const source=createS3Storage(cfg);
  const s3=new S3Client({endpoint:cfg.endpoint,region:cfg.region,forcePathStyle:cfg.forcePathStyle,credentials:{accessKeyId:cfg.accessKeyId,secretAccessKey:cfg.secretAccessKey}});
  const database=`mory_restore_${randomUUID().replaceAll("-","")}`;const bucket=`mory-restore-${randomUUID()}`;const restoreURL=new URL(process.env.DATABASE_URL!);restoreURL.pathname=`/${database}`;
  const admin=new pg.Client({connectionString:process.env.DATABASE_URL});await admin.connect();
  const familyIds:string[]=[];const userIds:string[]=[];const objectKeys:string[]=[];let restored:ReturnType<typeof createDatabaseClient>|undefined;
  const dump=path.resolve("scripts/test-pg-dump.mjs");const psql=path.resolve("scripts/test-psql.mjs");
  const destination=createS3Storage({...cfg,bucket});let createdDB=false;let createdBucket=false;
  try{
   await admin.query(`CREATE DATABASE "${database}"`);createdDB=true;await s3.send(new CreateBucketCommand({Bucket:bucket}));createdBucket=true;
   for(let i=0;i<2;i++){
    const user=await db.user.create({data:{displayName:"Recovery private",email:`${randomUUID()}@example.test`,emailVerified:true}});userIds.push(user.id);
    const family=await db.family.create({data:{name:`Recovery ${i}`}});familyIds.push(family.id);await db.familyMember.create({data:{userId:user.id,familyId:family.id,role:"OWNER"}});
    await db.familyInvitation.create({data:{familyId:family.id,createdById:user.id,tokenHash:randomBytes(32).toString("hex"),role:"PARENT",expiresAt:new Date(Date.now()+86_400_000)}});
    const child=await db.child.create({data:{familyId:family.id,name:"Private child",lifecycle:"AFTER_BIRTH",birthDate:new Date("2024-01-01Z")}});
    const asset=randomUUID();const objectKey=`families/${family.id}/children/${child.id}/avatars/${asset}`;objectKeys.push(objectKey);
    await source.putObject(objectKey,Buffer.from(`private-image-${i}`));
    await db.mediaAsset.create({data:{id:asset,familyId:family.id,childId:child.id,purpose:"AVATAR",objectKey,contentType:"image/webp",byteLength:15,status:"READY",width:1,height:1}});
    await db.child.update({where:{id:child.id},data:{avatarAssetId:asset}});
    await db.authAccount.create({data:{accountId:user.id,providerId:"credential",userId:user.id,password:"PRIVATE_PASSWORD_HASH"}});
    await db.authSession.create({data:{userId:user.id,token:randomUUID(),expiresAt:new Date(Date.now()+60_000)}});
   }
   const backup=path.join(directory,"backup.enc"),ledger=path.join(directory,"deletions.enc");
   await createBackup(db,process.env.DATABASE_URL!,source,backup,key,dump);
   expect((await readFile(backup)).includes(Buffer.from("PRIVATE_PASSWORD_HASH"))).toBe(false);
   await db.deletionTombstone.createMany({data:[{kind:"FAMILY",resourceId:familyIds[1]},{kind:"USER",resourceId:userIds[1]}]});
   await exportDeletionLedger(db,ledger,key);
   await expect(restoreBackup(restoreURL.toString(),destination,backup,ledger,randomBytes(32),psql)).rejects.toThrow();
   const tampered=path.join(directory,"bad.enc");const bytes=await readFile(backup);bytes[40]^=1;await writeFile(tampered,bytes);
   await expect(restoreBackup(restoreURL.toString(),destination,tampered,ledger,key,psql)).rejects.toThrow();
   await destination.putObject(objectKeys[0],Buffer.from("existing"));
   await expect(restoreBackup(restoreURL.toString(),destination,backup,ledger,key,psql)).rejects.toThrow(/empty media/);await destination.deleteObject(objectKeys[0]);
   const incomplete=path.join(directory,"incomplete.enc");
   await writeEncryptedBackup(incomplete,key,async(record)=>{await readEncryptedBackup(backup,key,async(raw)=>{if((raw as {type:string}).type!=="end")await record(raw);});});
   await expect(restoreBackup(restoreURL.toString(),destination,incomplete,ledger,key,psql)).rejects.toThrow(/Incomplete backup/);
   expect((await destination.listObjects()).objects).toHaveLength(0);
   const emptyCheck=new pg.Client({connectionString:restoreURL.toString()});await emptyCheck.connect();
   try{expect((await emptyCheck.query("SELECT count(*)::int AS n FROM pg_tables WHERE schemaname='public'")).rows[0].n).toBe(0);}finally{await emptyCheck.end();}
   await restoreBackup(restoreURL.toString(),destination,backup,ledger,key,psql);
   restored=createDatabaseClient(restoreURL.toString());
   expect(await restored.family.findUnique({where:{id:familyIds[0]}})).not.toBeNull();expect(await restored.family.findUnique({where:{id:familyIds[1]}})).toBeNull();
   expect(await restored.user.findUnique({where:{id:userIds[1]}})).toBeNull();
   expect(await restored.authSession.count()).toBe(0);expect(await restored.authVerification.count()).toBe(0);expect(await restored.authMailJob.count()).toBe(0);expect(await restored.familyInvitation.count()).toBe(0);
   expect(await restored.authAccount.findFirst({where:{userId:userIds[0]}})).toMatchObject({password:null});
   expect((await destination.getObject(objectKeys[0])).toString()).toBe("private-image-0");
   await expect(destination.getObject(objectKeys[1])).rejects.toThrow();
   expect(await restored.child.count({where:{familyId:familyIds[0]}})).toBe(1);
   await expect(restoreBackup(restoreURL.toString(),destination,backup,ledger,key,psql)).rejects.toThrow(/empty public/);
  }finally{
   await restored?.$disconnect();
   if(createdDB)await admin.query(`DROP DATABASE "${database}" WITH (FORCE)`);
   await admin.end();
   for(const objectKey of objectKeys){await source.deleteObject(objectKey).catch(()=>{});if(createdBucket)await destination.deleteObject(objectKey).catch(()=>{});}
   // Restored source may contain other test assets: enumerate only this owned disposable bucket.
   if(createdBucket){let cursor:string|undefined;do{const page=await destination.listObjects(cursor);for(const o of page.objects)await destination.deleteObject(o.key);cursor=page.cursor;}while(cursor);await s3.send(new DeleteBucketCommand({Bucket:bucket}));}
   await db.child.updateMany({where:{familyId:{in:familyIds}},data:{avatarAssetId:null}});await db.family.deleteMany({where:{id:{in:familyIds}}});await db.user.deleteMany({where:{id:{in:userIds}}});await db.deletionTombstone.deleteMany({where:{resourceId:{in:[...familyIds,...userIds]}}});
   await db.$disconnect();s3.destroy();await rm(directory,{recursive:true,force:true});
  }
 },120_000);
});
