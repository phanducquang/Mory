import {writeFile} from "node:fs/promises";
import {randomUUID} from "node:crypto";
import {expect,it,vi} from "vitest";
vi.mock("server-only",()=>({}));
import {queryFamilyEvents} from "@/server/repositories/postgres-event-query";
import {createDatabaseClient} from "@/server/db/client";
if(process.env.MORY_INTEGRATION_DATABASE!=="disposable-docker")throw new Error("Use disposable DB runner.");
it("uses the family/child timeline index for bounded keyset pages over 5000 events",async()=>{
 const db=createDatabaseClient();const family=await db.family.create({data:{name:"Performance fixture"}});
 try{
  const child=await db.child.create({data:{familyId:family.id,name:"Synthetic",lifecycle:"AFTER_BIRTH",birthDate:new Date("2020-01-01Z")}});
  await db.event.createMany({data:Array.from({length:5000},(_,i)=>({id:randomUUID(),familyId:family.id,childId:child.id,title:"Synthetic event",date:new Date(Date.UTC(2020,0,1+i%1500)),time:"09:00",type:"memory" as const}))});
  await db.$executeRawUnsafe('ANALYZE "Event"');
  const result=await db.$queryRawUnsafe<[{"QUERY PLAN":unknown}]>('EXPLAIN (ANALYZE,BUFFERS,FORMAT JSON) SELECT "id","date","time" FROM "Event" WHERE "familyId"=$1::uuid AND "childId"=$2::uuid ORDER BY "date" DESC,"time" DESC,"id" DESC LIMIT 26',family.id,child.id);
  const plan=JSON.stringify(result);expect(plan).toContain("Event_familyId_childId_date_time_id_idx");expect(plan).toContain("Index Only Scan");
  const timings:number[]=[];for(let i=0;i<20;i++){const start=performance.now();const page=await queryFamilyEvents(db,family.id,child.id,{period:"past",order:"desc"});expect(page.events).toHaveLength(25);expect(page.nextCursor).toBeTruthy();timings.push(performance.now()-start);}
  timings.sort((a,b)=>a-b);await writeFile("/private/tmp/mory-performance.json",JSON.stringify({benchmark:"timeline-5000-local",samples:20,medianMs:Number(timings[10].toFixed(2)),p95Ms:Number(timings[18].toFixed(2)),indexed:true}),{mode:0o600});
 }finally{await db.family.delete({where:{id:family.id}});await db.$disconnect();}
},60_000);
