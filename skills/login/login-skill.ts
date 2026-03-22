import fs from 'fs';
import path from 'path';
import { chromium } from 'playwright';

const MODULE = 'LoginSkill';

export interface LoginInput {
  skillId: string;
  traceId: string;
  platform: 'facebook' | 'tiktok';
  action: 'login' | 'saveCookie' | 'loginWithCookie';
}

export interface LoginOutput {
  code: number;
  data: {
    success: boolean;
    message: string;
    cookiePath?: string;
  };
}

function log(message: string): void {
  console.log(`[${MODULE}] [${new Date().toISOString()}] ${message}`);
}

// 获取当前文件目录
let __dirname = path.dirname(new URL(import.meta.url).pathname);
// 修复Windows路径问题（移除开头的反斜杠）
if (__dirname.startsWith('/')) {
  __dirname = __dirname.substring(1);
}

// 确保cookie目录存在
const cookieDir = path.join(__dirname, '../../cookie');
if (!fs.existsSync(cookieDir)) {
  fs.mkdirSync(cookieDir, { recursive: true });
}

// 打开Facebook登录页面
async function openFacebookLogin(): Promise<any> {
  log('打开Facebook登录页面');
  
  const browser = await chromium.launch({
    headless: false,
    defaultViewport: null,
    args: ['--start-maximized']
  });
  
  const page = await browser.newPage();
  
  try {
    // 导航到Facebook登录页面
    await page.goto('https://www.facebook.com/login', { waitUntil: 'networkidle' });
    
    log('Facebook登录页面已打开，请在浏览器中输入账号密码');
    return { page, browser };
  } catch (error) {
    log(`打开Facebook登录页面失败: ${error instanceof Error ? error.message : String(error)}`);
    await browser.close();
    throw error;
  }
}

// 打开TikTok登录页面
async function openTikTokLogin(): Promise<any> {
  log('打开TikTok登录页面');
  
  const browser = await chromium.launch({
    headless: false,
    defaultViewport: null,
    args: ['--start-maximized']
  });
  
  const page = await browser.newPage();
  
  try {
    // 导航到TikTok登录页面
    await page.goto('https://www.tiktok.com/login', { waitUntil: 'networkidle' });
    
    // 等待登录表单加载
    await page.waitForTimeout(3000);
    
    log('TikTok登录页面已打开，请在浏览器中输入账号密码');
    return { page, browser };
  } catch (error) {
    log(`打开TikTok登录页面失败: ${error instanceof Error ? error.message : String(error)}`);
    await browser.close();
    throw error;
  }
}

// 保存cookie
async function saveCookie(page: any, platform: 'facebook' | 'tiktok'): Promise<string> {
  log(`开始保存${platform} cookie`);
  
  try {
    // 获取cookie
    const cookies = await page.context().cookies();
    
    // 生成cookie文件名
    const cookieFileName = `${platform}_${Date.now()}.json`;
    const cookieFilePath = path.join(cookieDir, cookieFileName);
    
    // 保存cookie到文件
    fs.writeFileSync(cookieFilePath, JSON.stringify(cookies, null, 2), 'utf8');
    
    log(`Cookie保存成功: ${cookieFilePath}`);
    return cookieFilePath;
  } catch (error) {
    log(`保存Cookie失败: ${error instanceof Error ? error.message : String(error)}`);
    throw error;
  }
}

// 全局存储浏览器实例
let browserInstances: { [key: string]: any } = {};

// 携带Cookie登录
async function loginWithCookie(platform: 'facebook' | 'tiktok'): Promise<any> {
  log(`开始${platform}携带Cookie登录`);
  
  // 查找最新的cookie文件
  const cookieFiles = fs.readdirSync(cookieDir).filter(file => file.startsWith(platform));
  if (cookieFiles.length === 0) {
    throw new Error(`没有找到${platform}的Cookie文件，请先保存Cookie`);
  }
  
  // 按修改时间排序，获取最新的cookie文件
  cookieFiles.sort((a, b) => {
    const aTime = fs.statSync(path.join(cookieDir, a)).mtime.getTime();
    const bTime = fs.statSync(path.join(cookieDir, b)).mtime.getTime();
    return bTime - aTime;
  });
  
  const latestCookieFile = path.join(cookieDir, cookieFiles[0]);
  log(`使用Cookie文件: ${latestCookieFile}`);
  
  // 读取cookie
  const cookies = JSON.parse(fs.readFileSync(latestCookieFile, 'utf8'));
  
  const browser = await chromium.launch({
    headless: false,
    defaultViewport: null,
    args: ['--start-maximized']
  });
  
  const page = await browser.newPage();
  
  try {
    // 设置cookie
    await page.context().addCookies(cookies);
    
    // 导航到平台主页
    const url = platform === 'facebook' ? 'https://www.facebook.com' : 'https://www.tiktok.com';
    await page.goto(url, { waitUntil: 'networkidle' });
    
    log(`${platform}携带Cookie登录成功`);
    return { page, browser };
  } catch (error) {
    log(`${platform}携带Cookie登录失败: ${error instanceof Error ? error.message : String(error)}`);
    await browser.close();
    throw error;
  }
}

export async function loginSkill(input: LoginInput): Promise<LoginOutput> {
  log(`开始${input.platform}登录任务，操作: ${input.action}`);
  
  try {
    let result: any = null;
    
    if (input.action === 'login') {
      // 打开登录页面，用户自己输入账号密码
      if (input.platform === 'facebook') {
        result = await openFacebookLogin();
      } else {
        result = await openTikTokLogin();
      }
      
      // 保存浏览器实例
      browserInstances[input.platform] = result;
      
      return {
        code: 0,
        data: {
          success: true,
          message: `${input.platform}登录页面已打开，请在浏览器中输入账号密码`
        }
      };
    } else if (input.action === 'saveCookie') {
      // 保存当前浏览器的cookie
      if (browserInstances[input.platform]) {
        result = browserInstances[input.platform];
        log(`使用已打开的${input.platform}浏览器实例保存Cookie`);
      } else {
        throw new Error(`请先打开${input.platform}登录页面`);
      }
      
      const cookiePath = await saveCookie(result.page, input.platform);
      
      // 关闭浏览器
      await result.browser.close();
      
      // 清除浏览器实例
      delete browserInstances[input.platform];
      
      return {
        code: 0,
        data: {
          success: true,
          message: `${input.platform} Cookie保存成功`,
          cookiePath: cookiePath
        }
      };
    } else if (input.action === 'loginWithCookie') {
      // 携带Cookie登录
      result = await loginWithCookie(input.platform);
      
      // 保存浏览器实例
      browserInstances[input.platform] = result;
      
      return {
        code: 0,
        data: {
          success: true,
          message: `${input.platform}已携带Cookie登录`
        }
      };
    } else {
      throw new Error('不支持的操作类型');
    }
  } catch (error) {
    log(`任务执行失败: ${error instanceof Error ? error.message : String(error)}`);
    return {
      code: 500,
      data: {
        success: false,
        message: error instanceof Error ? error.message : String(error)
      }
    };
  }
}
