import { expect,test } from "@playwright/test";
test("CSP uses a fresh nonce, preserves hydration and blocks untrusted inline handlers",async({page,request})=>{
 const a=await request.get("/home"),b=await request.get("/home");
 expect(a.headers()["content-security-policy"]).toContain("'strict-dynamic'");expect(a.headers()["content-security-policy"]).not.toBe(b.headers()["content-security-policy"]);
 expect(a.headers()["x-content-type-options"]).toBe("nosniff");expect(a.headers()["permissions-policy"]).toContain("camera=()");
 await page.goto("/home");await expect(page.getByRole("main")).toBeVisible();
 const inline=await page.locator("script:not([src])").evaluateAll((scripts)=>scripts.filter((s)=>s.textContent?.includes("self.__next_f")).every((s)=>((s as HTMLScriptElement).nonce?.length ?? 0)>10));expect(inline).toBe(true);
 // Exercise an actual user event outside DevTools evaluation's script execution privileges.
 await page.evaluate(()=>{
  document.addEventListener("securitypolicyviolation",(e)=>{if(e.violatedDirective.startsWith("script-src"))Reflect.set(window,"__moryCspBlocked",true);});
  const button=document.createElement("button");button.textContent="CSP injection fixture";button.style.cssText="position:fixed;top:20px;right:20px;z-index:2147483647";button.setAttribute("onclick","window.__moryInjected = true");document.body.append(button);
 });
 await page.getByRole("button",{name:"CSP injection fixture"}).click();
 await expect.poll(()=>page.evaluate(()=>Reflect.get(window,"__moryCspBlocked"))).toBe(true);
 expect(await page.evaluate(()=>Reflect.get(window,"__moryInjected"))).toBeUndefined();
});
