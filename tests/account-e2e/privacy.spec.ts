import { randomBytes,randomUUID } from "node:crypto";
import { expect,test } from "@playwright/test";
import pg from "pg";
import { completeVerification } from "./email-utils";
if(process.env.MORY_INTEGRATION_DATABASE!=="disposable-docker")throw new Error("Use disposable account runner.");
const pool=new pg.Pool({connectionString:process.env.DATABASE_URL});const password=randomBytes(24).toString("hex");
test.beforeEach(async()=>{await pool.query('DELETE FROM "AuthRateLimit"');});test.afterAll(async()=>{await pool.end();});
test("account deletion requires password, revokes the session and gates retained data immediately",async({page,request})=>{
 const email=`${randomUUID()}@example.test`;
 await page.goto("/register");await page.getByLabel("Tên của bạn",{exact:true}).fill("Privacy parent");await page.getByLabel("Email",{exact:true}).fill(email);await page.getByLabel("Mật khẩu",{exact:true}).fill(password);await page.getByRole("button",{name:"Tạo tài khoản",exact:true}).click();await completeVerification(page,email,password);
 await page.getByRole("button",{name:"Tạo không gian gia đình"}).click();await expect(page.getByRole("heading",{name:"Bắt đầu hành trình của con"})).toBeVisible();
 const user=(await pool.query('SELECT "id" FROM "User" WHERE "email"=$1',[email])).rows[0];
 const family=(await pool.query('SELECT "familyId" FROM "FamilyMember" WHERE "userId"=$1',[user.id])).rows[0];
 const cookie=(await page.context().cookies()).find((c)=>c.name==="mory.session_token")!;
 await page.goto("/account");await page.getByRole("button",{name:"Xem lựa chọn xóa tài khoản"}).click();await page.getByLabel("Mật khẩu hiện tại").fill("wrong-password-local");await page.getByLabel("Nhập XÓA TÀI KHOẢN").fill("XÓA TÀI KHOẢN");await page.getByRole("button",{name:"Xóa tài khoản của tôi",exact:true}).click();await expect(page.locator(".auth-card p[role=alert]")).toContainText("Mật khẩu chưa đúng");
 expect((await pool.query('SELECT "deletionRequestedAt" FROM "User" WHERE "id"=$1',[user.id])).rows[0].deletionRequestedAt).toBeNull();
 await page.getByLabel("Mật khẩu hiện tại").fill(password);await page.getByRole("button",{name:"Xóa tài khoản của tôi",exact:true}).click();await expect(page).toHaveURL(/\/account-deleted$/);await expect(page.getByRole("heading",{name:"Đã đóng quyền truy cập"})).toBeVisible();
 expect((await pool.query('SELECT "deletionRequestedAt" FROM "Family" WHERE "id"=$1',[family.familyId])).rows[0].deletionRequestedAt).not.toBeNull();
 expect(await (await request.get("/api/auth/get-session",{headers:{cookie:`${cookie.name}=${cookie.value}`}})).json()).toBeNull();
 await page.goto("/home");await expect(page).toHaveURL(/\/login$/);
 const result=await request.post("/api/auth/sign-in/email",{headers:{Origin:process.env.PLAYWRIGHT_BASE_URL!},data:{email,password}});expect(result.ok()).toBe(false);
});
test("owner can inspect audit, transfer ownership and delete a family with reauthentication",async({page})=>{
 const email=`${randomUUID()}@example.test`;
 await page.goto("/register");await page.getByLabel("Tên của bạn",{exact:true}).fill("Family privacy owner");await page.getByLabel("Email",{exact:true}).fill(email);await page.getByLabel("Mật khẩu",{exact:true}).fill(password);await page.getByRole("button",{name:"Tạo tài khoản",exact:true}).click();await completeVerification(page,email,password);await page.getByRole("button",{name:"Tạo không gian gia đình"}).click();await expect(page.getByRole("heading",{name:"Bắt đầu hành trình của con"})).toBeVisible();
 const user=(await pool.query('SELECT "id" FROM "User" WHERE "email"=$1',[email])).rows[0];const family=(await pool.query('SELECT "familyId" FROM "FamilyMember" WHERE "userId"=$1',[user.id])).rows[0];
 await pool.query('INSERT INTO "Child" ("id","familyId","name","lifecycle","birthDate","updatedAt") VALUES ($1,$2,\'Synthetic privacy child\',\'AFTER_BIRTH\',\'2024-01-01\',now())',[randomUUID(),family.familyId]);
 const recipient=randomUUID();await pool.query('INSERT INTO "User" ("id","displayName","email","emailVerified","updatedAt") VALUES ($1,\'Local member\',$2,true,now())',[recipient,`${randomUUID()}@example.test`]);await pool.query('INSERT INTO "FamilyMember" ("familyId","userId","role") VALUES ($1,$2,\'VIEWER\')',[family.familyId,recipient]);
 await page.goto("/settings");await page.getByRole("button",{name:"Xem hoạt động gia đình"}).click();await expect(page.locator(".audit-list")).toBeVisible();
 await page.getByRole("button",{name:"Xem lựa chọn gia đình"}).click();
 await expect(page.getByLabel("Mật khẩu hiện tại")).toBeVisible();
 await page.setViewportSize({width:390,height:844});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);await page.screenshot({path:"/private/tmp/mory-account-privacy.png",fullPage:true});
 await page.getByLabel("Mật khẩu hiện tại").fill(password);await page.getByLabel("Chuyển quyền cho").selectOption(recipient);await page.getByRole("button",{name:"Xác nhận chuyển quyền sở hữu"}).click();
 await expect.poll(async()=>(await pool.query('SELECT "role" FROM "FamilyMember" WHERE "familyId"=$1 AND "userId"=$2',[family.familyId,user.id])).rows[0].role).toBe("PARENT");
 await page.waitForURL(/\/settings$/);await page.getByRole("button",{name:"Xem lựa chọn gia đình"}).click();await expect(page.locator(".settings-card p[role=alert]")).toContainText("Chỉ chủ gia đình");
 // Re-establish the fixture owner through the owned test DB to exercise the independent deletion flow.
 await pool.query('UPDATE "FamilyMember" SET "role"=\'OWNER\' WHERE "familyId"=$1 AND "userId"=$2',[family.familyId,user.id]);await page.reload();await page.getByRole("button",{name:"Xem lựa chọn gia đình"}).click();await page.getByLabel("Mật khẩu hiện tại").fill(password);await page.getByLabel("Nhập XÓA GIA ĐÌNH").fill("XÓA GIA ĐÌNH");await page.getByRole("button",{name:"Xóa toàn bộ gia đình",exact:true}).click();await expect(page).toHaveURL(/\/welcome$/);await expect(page.getByRole("button",{name:"Tạo không gian gia đình"})).toBeVisible();
 expect((await pool.query('SELECT "deletionRequestedAt" FROM "Family" WHERE "id"=$1',[family.familyId])).rows[0].deletionRequestedAt).not.toBeNull();
});
