const express = require('express');
const { chromium } = require('playwright');
const cheerio = require('cheerio');
const axios = require('axios');
const fs = require('fs');
const path = require('path');
const schedule = require('node-schedule');

const app = express();
const port = 3000;

// 静态文件服务
app.use(express.static('public'));

// 解析 JSON 请求体
app.use(express.json());

// CORS配置
app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    
    if (req.method === 'OPTIONS') {
        return res.sendStatus(200);
    }
    
    next();
});

// 任务存储文件
const tasksFile = path.join(__dirname, 'data', 'tasks.json');
// 任务执行状态文件
const taskStatusFile = path.join(__dirname, 'data', 'task-status.json');

// 确保数据目录存在
if (!fs.existsSync(path.join(__dirname, 'data'))) {
    fs.mkdirSync(path.join(__dirname, 'data'), { recursive: true });
}

// 初始化任务存储
if (!fs.existsSync(tasksFile)) {
    fs.writeFileSync(tasksFile, JSON.stringify([]), 'utf8');
}

// 初始化任务执行状态存储
if (!fs.existsSync(taskStatusFile)) {
    fs.writeFileSync(taskStatusFile, JSON.stringify({}), 'utf8');
}

// 加载任务
function loadTasks() {
    try {
        const content = fs.readFileSync(tasksFile, 'utf8');
        return JSON.parse(content);
    } catch (error) {
        console.error('加载任务失败:', error);
        return [];
    }
}

// 保存任务
function saveTasks(tasks) {
    try {
        fs.writeFileSync(tasksFile, JSON.stringify(tasks, null, 2), 'utf8');
    } catch (error) {
        console.error('保存任务失败:', error);
    }
}

// 加载任务执行状态
function loadTaskStatus() {
    try {
        const content = fs.readFileSync(taskStatusFile, 'utf8');
        return JSON.parse(content);
    } catch (error) {
        console.error('加载任务执行状态失败:', error);
        return {};
    }
}

// 保存任务执行状态
function saveTaskStatus(status) {
    try {
        fs.writeFileSync(taskStatusFile, JSON.stringify(status, null, 2), 'utf8');
    } catch (error) {
        console.error('保存任务执行状态失败:', error);
    }
}

// 更新任务执行状态
function updateTaskStatus(taskId, status) {
    try {
        const taskStatus = loadTaskStatus();
        taskStatus[taskId] = {
            ...status,
            updatedAt: new Date().toISOString()
        };
        saveTaskStatus(taskStatus);
    } catch (error) {
        console.error('更新任务执行状态失败:', error);
    }
}

// 任务调度器
const taskJobs = new Map();

// 启动任务调度
function startTaskScheduler() {
    const tasks = loadTasks();
    tasks.forEach(task => {
        scheduleTask(task);
    });
}

// 调度单个任务
function scheduleTask(task) {
    // 取消之前的任务
    if (taskJobs.has(task.id)) {
        taskJobs.get(task.id).cancel();
    }
    
    // 支持立即执行
    if (task.time === 'now') {
        console.log(`立即执行任务: ${task.skill}`);
        executeTask(task);
        return;
    }
    
    // 解析时间
    const [hours, minutes] = task.time.split(':').map(Number);
    
    // 创建定时任务
    const job = schedule.scheduleJob({ hour: hours, minute: minutes }, () => {
        executeTask(task);
    });
    
    taskJobs.set(task.id, job);
    console.log(`任务调度成功: ${task.time} - ${task.skill}`);
}

// 执行任务
async function executeTask(task) {
    console.log(`执行任务: ${task.time} - ${task.skill}`);
    
    // 更新任务执行状态为开始
    updateTaskStatus(task.id, {
        status: 'running',
        startTime: new Date().toISOString()
    });
    
    try {
        // 根据技能类型执行不同的任务
        switch (task.skill) {
            // Facebook 技能
            case 'facebook-login':
                // 执行 Facebook 登录任务
                const { loginToFacebook } = require('./dist/skills/facebook-skills');
                await loginToFacebook({ timeoutSeconds: 180 });
                break;
            case 'facebook-post':
                // 执行 Facebook 发帖任务
                const { postToFacebookReal } = require('./skills/facebook/facebook-post-real.js');
                
                // 从文件读取文本内容
                const textFilePath = path.join(__dirname, 'tiezi', '1.txt');
                let postText = '测试 Facebook 发帖功能';
                if (fs.existsSync(textFilePath)) {
                    try {
                        postText = fs.readFileSync(textFilePath, 'utf8').trim();
                        console.log('成功读取文本文件:', textFilePath);
                    } catch (error) {
                        console.error('读取文本文件失败:', error);
                    }
                }
                
                // 选择图片
                const imagesDir = path.join(__dirname, 'images');
                let selectedImage = null;
                if (fs.existsSync(imagesDir)) {
                    const files = fs.readdirSync(imagesDir).filter(file => {
                        const ext = path.extname(file).toLowerCase();
                        return ['.jpg', '.jpeg', '.png', '.gif', '.webp'].includes(ext);
                    }).sort((a, b) => {
                        const aName = path.basename(a, path.extname(a));
                        const bName = path.basename(b, path.extname(b));
                        const aNum = parseInt(aName);
                        const bNum = parseInt(bName);
                        if (!isNaN(aNum) && !isNaN(bNum)) {
                            return aNum - bNum;
                        }
                        return a.localeCompare(b);
                    });
                    
                    if (files.length > 0) {
                        // 加载并更新图片索引
                        const imageIndexFile = path.join(__dirname, 'data', 'image-index.json');
                        let lastIndex = 0;
                        if (fs.existsSync(imageIndexFile)) {
                            try {
                                const content = fs.readFileSync(imageIndexFile, 'utf8');
                                const data = JSON.parse(content);
                                lastIndex = data.lastIndex || 0;
                            } catch (error) {
                                console.error('加载图片索引失败:', error);
                            }
                        }
                        
                        // 轮回选择图片
                        selectedImage = path.join(imagesDir, files[lastIndex % files.length]);
                        lastIndex++;
                        
                        // 保存图片索引
                        try {
                            const data = { lastIndex };
                            fs.writeFileSync(imageIndexFile, JSON.stringify(data, null, 2), 'utf8');
                        } catch (error) {
                            console.error('保存图片索引失败:', error);
                        }
                    }
                }
                
                // 发布到Facebook
                const postParams = {
                    text: postText,
                    publish: true
                };
                
                if (selectedImage) {
                    postParams.imagePaths = [selectedImage];
                }
                
                await postToFacebookReal(postParams);
                break;
            case 'facebook-close-window':
                // 执行关闭浏览器窗口任务
                const { closeFacebookWindow } = require('./skills/facebook/facebook-close-window.js');
                await closeFacebookWindow();
                break;
            case 'hot-search-interact':
                // 执行热搜词二次交互任务
                console.log('=== 开始执行热搜词二次交互技能 ===');
                try {
                    console.log('正在加载热搜词二次交互技能模块...');
                    const { interactHotSearch } = require('./dist/skills/hot-search/hot-search-interact');
                    console.log('技能模块加载成功');
                    
                    console.log('正在执行热搜词二次交互技能...');
                    const result = await interactHotSearch({
                        skillId: 'hot-search-interact',
                        traceId: `hot-search-interact-${Date.now()}`
                    });
                    console.log('热搜词二次交互技能执行完成，结果:', result);
                } catch (error) {
                    console.error('热搜词二次交互技能执行失败:', error);
                    console.error('错误堆栈:', error.stack);
                    throw error;
                }
                console.log('=== 热搜词二次交互技能执行完成 ===');
                break;
            case 'facebook-interact':
                // 执行 Facebook 互动任务
                const { interactFacebook } = require('./dist/skills/facebook-skills');
                await interactFacebook({ 
                    action: 'like', 
                    postId: 'test-post-id' 
                });
                break;
            case 'facebook-search':
                // 执行 Facebook 搜索任务
                const { searchFacebook } = require('./dist/skills/facebook-skills');
                await searchFacebook({ 
                    keywords: ['AI', '人工智能'], 
                    maxPosts: 10 
                });
                break;
            case 'facebook-join-groups':
                // 执行 Facebook 加入小组任务
                const { autoJoinFacebookGroups } = require('./skills/facebook/facebook-auto-join-groups.js');
                await autoJoinFacebookGroups({ maxGroups: 1 });
                break;
            case 'facebook-post-analysis':
                // 执行 Facebook 帖子分析任务
                const { analyzeFacebookPosts } = require('./skills/facebook/facebook-post-analysis.js');
                await analyzeFacebookPosts();
                break;
            case 'facebook-analyze-comment':
                // 执行 Facebook 帖子分析与评论任务
                console.log('=== 开始执行 Facebook 帖子分析与评论技能 ===');
                try {
                    const skillPath = './skills/facebook/facebook-post-analyze-comment.js';
                    console.log('检查技能文件是否存在:', skillPath);
                    if (!fs.existsSync(path.join(__dirname, skillPath))) {
                        throw new Error('技能文件不存在');
                    }
                    console.log('技能文件存在');
                    
                    console.log('正在加载技能模块...');
                    delete require.cache[require.resolve(skillPath)];
                    const skillModule = require(skillPath);
                    console.log('技能模块加载成功，导出的函数:', Object.keys(skillModule));
                    
                    if (!skillModule.analyzeAndCommentFacebookPosts) {
                        throw new Error('技能模块没有导出 analyzeAndCommentFacebookPosts 函数');
                    }
                    console.log('确认函数存在');
                    
                    console.log('正在执行技能...');
                    const result = await skillModule.analyzeAndCommentFacebookPosts();
                    console.log('技能执行完成，结果:', result);
                    
                    if (result && result.code === 0) {
                        console.log('技能执行成功');
                    } else {
                        console.log('技能执行返回非成功状态:', result);
                    }
                } catch (error) {
                    console.error('技能执行失败:', error.message);
                    console.error('错误堆栈:', error.stack);
                    throw error;
                }
                console.log('=== Facebook 帖子分析与评论技能执行完成 ===');
                break;
            
            // Weibo 技能
            case 'weibo-post-media':
                // 执行微博发布媒体任务
                console.log('执行微博发布媒体任务');
                break;
            case 'weibo-follow-smart':
                // 执行微博智能关注任务
                console.log('执行微博智能关注任务');
                break;
            case 'weibo-follow-interest':
                // 执行微博兴趣关注任务
                console.log('执行微博兴趣关注任务');
                break;
            case 'weibo-ai-news':
                // 执行微博 AI 新闻任务
                console.log('执行微博 AI 新闻任务');
                break;
            case 'weibo-hot':
                // 执行微博热搜任务
                console.log('执行微博热搜任务');
                break;
            case 'weibo-llm-generate':
                // 执行微博 LLM 生成任务
                console.log('执行微博 LLM 生成任务');
                break;
            case 'weibo-image':
                // 执行微博图片任务
                console.log('执行微博图片任务');
                break;
            case 'weibo-post':
                // 执行微博发布任务
                console.log('执行微博发布任务');
                break;
            case 'weibo-interact':
                // 执行微博互动任务
                console.log('执行微博互动任务');
                break;
            case 'weibo-message':
                // 执行微博消息任务
                console.log('执行微博消息任务');
                break;
            case 'weibo-douyin-like':
                // 执行抖音点赞任务
                console.log('执行抖音点赞任务');
                break;
            case 'weibo-douyin-smart':
                // 执行抖音智能互动任务
                console.log('执行抖音智能互动任务');
                break;
            
            // 其他技能
            case 'news-distillation':
                // 执行新闻蒸馏任务
                const { newsDistillationSkill } = require('./dist/skills/news-distillation/news-distillation');
                await newsDistillationSkill.execute(`task-${Date.now()}`);
                break;
            case 'hot-search-explorer':
                // 执行热搜词探索任务
                console.log('=== 开始执行热搜词探索技能 ===');
                try {
                    console.log('正在加载热搜词探索技能模块...');
                    const { exploreHotSearch } = require('./dist/skills/hot-search/hot-search-explorer');
                    console.log('技能模块加载成功');
                    
                    console.log('正在执行热搜词探索技能...');
                    const result = await exploreHotSearch({ skillId: 'hot-search-explorer', traceId: `task-${Date.now()}` });
                    console.log('热搜词探索技能执行完成，结果:', result);
                } catch (error) {
                    console.error('热搜词探索技能执行失败:', error);
                    console.error('错误堆栈:', error.stack);
                    throw error;
                }
                console.log('=== 热搜词探索技能执行完成 ===');
                break;
            case 'daily-post':
                // 执行每日发帖任务
                const { LLMSlient } = require('./dist/core/llm/llm-client');
                const { postToFacebookReal: dailyPostFacebook } = require('./skills/facebook/facebook-post-real.js');
                
                // 加载提示词
                const promptPath = path.join(__dirname, 'sou', 'prompt.txt');
                let prompt = '请直接输出：今天 AI 圈 / 科技圈 最重要的 1 条技术新闻，(只要技术类新闻) 用大白话总结给出自己的思考跟观点，适合发帖字数 100字内 。不要包含任何思考过程或其他说明，直接输出最终内容。';
                if (fs.existsSync(promptPath)) {
                    prompt = fs.readFileSync(promptPath, 'utf8').trim();
                }
                
                // 调用大模型
                const llmClient = new LLMSlient();
                const response = await llmClient.generate({
                    prompt,
                    skillId: 'daily-post',
                    traceId: `task-${Date.now()}`,
                    parameters: {
                        maxTokens: 200
                    }
                });
                
                if (response.ok && response.data?.content) {
                    // 保存结果到tiezi目录
                    const tieziDir = path.join(__dirname, 'tiezi');
                    if (!fs.existsSync(tieziDir)) {
                        fs.mkdirSync(tieziDir, { recursive: true });
                    }
                    const date = new Date().toISOString().split('T')[0];
                    const outputPath = path.join(tieziDir, `${date}_post.txt`);
                    fs.writeFileSync(outputPath, response.data.content, 'utf8');
                    
                    // 选择图片
                    const imagesDir = path.join(__dirname, 'images');
                    let selectedImage = null;
                    if (fs.existsSync(imagesDir)) {
                        const files = fs.readdirSync(imagesDir).filter(file => {
                            const ext = path.extname(file).toLowerCase();
                            return ['.jpg', '.jpeg', '.png', '.gif', '.webp'].includes(ext);
                        }).sort((a, b) => {
                            const aName = path.basename(a, path.extname(a));
                            const bName = path.basename(b, path.extname(b));
                            const aNum = parseInt(aName);
                            const bNum = parseInt(bName);
                            if (!isNaN(aNum) && !isNaN(bNum)) {
                                return aNum - bNum;
                            }
                            return a.localeCompare(b);
                        });
                        
                        if (files.length > 0) {
                            // 加载并更新图片索引
                            const imageIndexFile = path.join(__dirname, 'data', 'image-index.json');
                            let lastIndex = 0;
                            if (fs.existsSync(imageIndexFile)) {
                                try {
                                    const content = fs.readFileSync(imageIndexFile, 'utf8');
                                    const data = JSON.parse(content);
                                    lastIndex = data.lastIndex || 0;
                                } catch (error) {
                                    console.error('加载图片索引失败:', error);
                                }
                            }
                            
                            // 轮回选择图片
                            selectedImage = path.join(imagesDir, files[lastIndex % files.length]);
                            lastIndex++;
                            
                            // 保存图片索引
                            try {
                                const data = { lastIndex };
                                fs.writeFileSync(imageIndexFile, JSON.stringify(data, null, 2), 'utf8');
                            } catch (error) {
                                console.error('保存图片索引失败:', error);
                            }
                        }
                    }
                    
                    // 发布到Facebook
                    const postParams = {
                        text: response.data.content,
                        publish: true
                    };
                    
                    if (selectedImage) {
                        postParams.imagePaths = [selectedImage];
                    }
                    
                    await dailyPostFacebook(postParams);
                }
                break;
            case 'sixin-maintenance':
                // 执行私信维护任务
                console.log('=== 开始执行私信维护技能 ===');
                try {
                    console.log('正在加载私信维护技能模块...');
                    const { maintainSixin } = require('./dist/skills/sixin/sixin-maintenance');
                    console.log('技能模块加载成功');
                    
                    console.log('正在执行私信维护技能...');
                    const result = await maintainSixin({
                        skillId: 'sixin-maintenance',
                        traceId: `task-${Date.now()}`
                    });
                    console.log('私信维护技能执行完成，结果:', result);
                    
                    // 更新统计数据
                    const stats = loadSixinStats();
                    stats.totalCount += result.data.processedCount;
                    stats.successCount += result.data.successCount;
                    
                    // 更新今日维护数
                    const today = new Date().toISOString().split('T')[0];
                    if (!stats.lastMaintenance || stats.lastMaintenance !== today) {
                        stats.todayCount = result.data.processedCount;
                        stats.lastMaintenance = today;
                    } else {
                        stats.todayCount += result.data.processedCount;
                    }
                    
                    // 更新待处理数
                    stats.pendingCount = Math.max(0, stats.pendingCount - result.data.processedCount);
                    
                    saveSixinStats(stats);
                } catch (error) {
                    console.error('私信维护技能执行失败:', error);
                    console.error('错误堆栈:', error.stack);
                    throw error;
                }
                console.log('=== 私信维护技能执行完成 ===');
                break;
            case 'llm-document-analysis':
                // 执行 LLM 文档分析任务
                console.log('执行 LLM 文档分析任务');
                break;
        }
        
        console.log(`任务执行成功: ${task.time} - ${task.skill}`);
        
        // 更新任务执行状态为成功
        updateTaskStatus(task.id, {
            status: 'success',
            endTime: new Date().toISOString()
        });
    } catch (error) {
        console.error(`任务执行失败: ${task.time} - ${task.skill}`, error);
        
        // 更新任务执行状态为失败
        updateTaskStatus(task.id, {
            status: 'failed',
            endTime: new Date().toISOString(),
            error: error.message
        });
    }
}

// 启动任务调度器
startTaskScheduler();

// 搜索 API
app.post('/api/search', async (req, res) => {
    try {
        console.log('收到搜索请求:', req.body);
        const { keywords, platforms } = req.body;
        
        if (!keywords || !platforms || platforms.length === 0) {
            console.log('参数错误:', { keywords, platforms });
            return res.json({ success: false, message: '请提供搜索关键词和平台' });
        }
        
        console.log('开始搜索:', { keywords, platforms });
        const results = [];
        
        // 对每个平台执行搜索
        for (const platform of platforms) {
            try {
                console.log(`搜索平台: ${platform}`);
                const platformResults = await searchPlatform(platform, keywords);
                console.log(`平台 ${platform} 搜索结果数量: ${platformResults.length}`);
                results.push(...platformResults);
            } catch (error) {
                console.error(`搜索 ${platform} 失败:`, error);
                // 继续搜索其他平台
            }
        }
        
        console.log('搜索完成，总结果数量:', results.length);
        res.json({ success: true, results });
    } catch (error) {
        console.error('搜索失败:', error);
        res.json({ success: false, message: '搜索失败，请稍后重试' });
    }
});

// 搜索单个平台
async function searchPlatform(platform, keywords) {
    console.log(`开始搜索平台 ${platform}，关键词: ${keywords}`);
    
    // 处理新闻 API 平台
    if (platform === 'newsapi' || platform === 'gnews') {
        return await searchNewsAPI(platform, keywords);
    }
    
    // 处理其他平台（使用浏览器）
    let browser;
    
    try {
        console.log('启动浏览器...');
        browser = await chromium.launch({ headless: true });
        console.log('浏览器启动成功');
        
        const page = await browser.newPage();
        console.log('新页面创建成功');
        
        let url = '';
        
        // 根据平台构建搜索 URL
        switch (platform) {
            case 'google':
                url = `https://www.google.com/search?q=${encodeURIComponent(keywords)}&tbm=nws`;
                break;
            case 'bing':
                url = `https://www.bing.com/news/search?q=${encodeURIComponent(keywords)}`;
                break;
            case 'baidu':
                url = `https://www.baidu.com/s?wd=${encodeURIComponent(keywords)}&tn=news`;
                break;
            default:
                await browser.close();
                return [];
        }
        
        console.log(`访问 URL: ${url}`);
        // 访问搜索页面
        await page.goto(url, { timeout: 30000 });
        console.log('页面访问成功');
        
        // 等待页面加载完成
        console.log('等待页面加载完成...');
        await page.waitForLoadState('networkidle');
        console.log('页面加载完成');
        
        // 获取页面内容
        console.log('获取页面内容...');
        const html = await page.content();
        console.log('页面内容获取成功，长度:', html.length);
        
        const $ = cheerio.load(html);
        console.log('页面解析成功');
        
        // 解析搜索结果
        const results = [];
        
        switch (platform) {
            case 'google':
                console.log('开始解析 Google 搜索结果');
                // 尝试使用更通用的选择器
                $('.g').each((index, element) => {
                    const title = $(element).find('h3').text().trim();
                    const url = $(element).find('a').attr('href');
                    const content = $(element).find('.VwiC3b').text().trim();
                    
                    if (title && url) {
                        results.push({ title, url, content, platform });
                    }
                });
                console.log('Google 搜索结果解析完成，数量:', results.length);
                break;
                
            case 'bing':
                console.log('开始解析 Bing 搜索结果');
                $('.news-card').each((index, element) => {
                    const title = $(element).find('.title').text().trim();
                    const url = $(element).find('a').attr('href');
                    const content = $(element).find('.snippet').text().trim();
                    
                    if (title && url) {
                        results.push({ title, url, content, platform });
                    }
                });
                console.log('Bing 搜索结果解析完成，数量:', results.length);
                break;
                
            case 'baidu':
                console.log('开始解析百度搜索结果');
                $('.result').each((index, element) => {
                    const title = $(element).find('.t a').text().trim();
                    const url = $(element).find('.t a').attr('href');
                    const content = $(element).find('.c-summary').text().trim();
                    
                    if (title && url) {
                        results.push({ title, url, content, platform });
                    }
                });
                console.log('百度搜索结果解析完成，数量:', results.length);
                break;
        }
        
        console.log(`平台 ${platform} 搜索完成，结果数量: ${results.length}`);
        return results;
    } catch (error) {
        console.error(`搜索平台 ${platform} 失败:`, error);
        return [];
    } finally {
        if (browser) {
            try {
                console.log('关闭浏览器...');
                await browser.close();
                console.log('浏览器关闭成功');
            } catch (error) {
                console.error('关闭浏览器失败:', error);
            }
        }
    }
}

// 搜索新闻 API
async function searchNewsAPI(platform, keywords) {
    try {
        console.log(`开始搜索 ${platform} API，关键词: ${keywords}`);
        
        let url = '';
        let apiKey = '';
        
        switch (platform) {
            case 'newsapi':
                apiKey = '05a90af01d3040b793f74d6e41c5ea72';
                url = `https://newsapi.org/v2/everything?q=${encodeURIComponent(keywords)}&language=zh&sortBy=publishedAt&apiKey=${apiKey}`;
                break;
            case 'gnews':
                apiKey = 'ef01dbeea077f62ff84ad01421baf4af';
                url = `https://gnews.io/api/v4/search?q=${encodeURIComponent(keywords)}&lang=zh&max=10&apikey=${apiKey}`;
                break;
            default:
                return [];
        }
        
        console.log(`访问 API URL: ${url}`);
        const response = await axios.get(url);
        console.log(`${platform} API 响应状态:`, response.status);
        
        const results = [];
        
        if (platform === 'newsapi') {
            // 处理 NewsAPI 响应
            if (response.data.articles && response.data.articles.length > 0) {
                response.data.articles.forEach(article => {
                    if (article.title && article.url) {
                        results.push({
                            title: article.title,
                            url: article.url,
                            content: article.description || '',
                            platform: 'newsapi'
                        });
                    }
                });
            }
        } else if (platform === 'gnews') {
            // 处理 GNews API 响应
            if (response.data.articles && response.data.articles.length > 0) {
                response.data.articles.forEach(article => {
                    if (article.title && article.url) {
                        results.push({
                            title: article.title,
                            url: article.url,
                            content: article.description || '',
                            platform: 'gnews'
                        });
                    }
                });
            }
        }
        
        console.log(`${platform} API 搜索完成，结果数量: ${results.length}`);
        return results;
    } catch (error) {
        console.error(`搜索 ${platform} API 失败:`, error);
        return [];
    }
}

// API Key管理 API
app.get('/api/api-key/status', (req, res) => {
    try {
        const apiKeyFile = path.join(__dirname, 'data', 'llm-api-key2.txt');
        const hasApiKey = fs.existsSync(apiKeyFile);
        let lastModified = null;
        
        if (hasApiKey) {
            const stats = fs.statSync(apiKeyFile);
            lastModified = stats.mtime.toISOString();
        }
        
        res.json({
            success: true,
            data: {
                hasApiKey,
                apiKeyFile: hasApiKey ? apiKeyFile : null,
                lastModified
            }
        });
    } catch (error) {
        console.error('获取API Key状态失败:', error);
        res.json({ success: false, message: '获取API Key状态失败' });
    }
});

app.post('/api/api-key', (req, res) => {
    try {
        const { apiKey } = req.body;
        
        if (!apiKey || apiKey.trim() === '') {
            return res.json({ success: false, message: '请输入有效的API Key' });
        }
        
        const apiKeyFile = path.join(__dirname, 'data', 'llm-api-key2.txt');
        fs.writeFileSync(apiKeyFile, apiKey.trim(), 'utf8');
        
        console.log('API Key保存成功');
        res.json({ success: true, message: 'API Key保存成功' });
    } catch (error) {
        console.error('保存API Key失败:', error);
        res.json({ success: false, message: '保存API Key失败' });
    }
});

// 提示词管理 API
const promptsFile = path.join(__dirname, 'data', 'prompts.json');

function loadPrompts() {
    try {
        if (!fs.existsSync(promptsFile)) {
            // 创建默认提示词
            const defaultPrompts = {
                explorerPrompt: `你是一名资深AI领域专家，现在需要基于以下新闻内容创建一篇适合在Facebook上发布的帖子。
严格要求：
1. 只输出最终的Facebook帖子内容，绝对不要包含任何思考过程、草稿或分析步骤
2. 语言自然流畅，符合Facebook的社交风格，可适当添加emoji增强趣味性
3. 内容简洁易懂，控制在300字以内

新闻内容：AI领域最新行业动态`,
                interactPrompt: `你是一名资深AI技术博主，拥有多年的AI开发经验和实战经历。现在请基于以下新闻内容，创作一篇Facebook风格的感悟文章。
严格要求：
1. 以资深AI技术博主人设写作，要有真实的开发经历和实战经验分享，避免空泛的理论
2. 语言自然接地气，符合Facebook社交风格，可适当添加话题标签（如#AI开发）
3. 内容控制在400字以内，只输出最终文章内容，不包含任何思考过程
4. 结合新闻内容给出具体的实战感悟，而非单纯复述新闻

新闻内容：AI大模型最新商用动态`
            };
            fs.writeFileSync(promptsFile, JSON.stringify(defaultPrompts, null, 2), 'utf8');
            return defaultPrompts;
        }
        const content = fs.readFileSync(promptsFile, 'utf8');
        return JSON.parse(content);
    } catch (error) {
        console.error('读取提示词失败:', error);
        return {
            explorerPrompt: '',
            interactPrompt: ''
        };
    }
}

function savePrompts(prompts) {
    try {
        fs.writeFileSync(promptsFile, JSON.stringify(prompts, null, 2), 'utf8');
        return true;
    } catch (error) {
        console.error('保存提示词失败:', error);
        return false;
    }
}

app.get('/api/prompts', (req, res) => {
    try {
        const prompts = loadPrompts();
        res.json({
            success: true,
            data: prompts
        });
    } catch (error) {
        console.error('获取提示词失败:', error);
        res.json({ success: false, message: '获取提示词失败' });
    }
});

app.post('/api/prompts/explorer', (req, res) => {
    try {
        const { prompt } = req.body;
        
        if (!prompt || prompt.trim() === '') {
            return res.json({ success: false, message: '请输入有效的提示词' });
        }
        
        const prompts = loadPrompts();
        prompts.explorerPrompt = prompt;
        
        if (savePrompts(prompts)) {
            console.log('第一次探索提示词保存成功');
            res.json({ success: true, message: '第一次探索提示词保存成功' });
        } else {
            res.json({ success: false, message: '保存提示词失败' });
        }
    } catch (error) {
        console.error('保存第一次探索提示词失败:', error);
        res.json({ success: false, message: '保存提示词失败' });
    }
});

app.post('/api/prompts/interact', (req, res) => {
    try {
        const { prompt } = req.body;
        
        if (!prompt || prompt.trim() === '') {
            return res.json({ success: false, message: '请输入有效的提示词' });
        }
        
        const prompts = loadPrompts();
        prompts.interactPrompt = prompt;
        
        if (savePrompts(prompts)) {
            console.log('第二次探索提示词保存成功');
            res.json({ success: true, message: '第二次探索提示词保存成功' });
        } else {
            res.json({ success: false, message: '保存提示词失败' });
        }
    } catch (error) {
        console.error('保存第二次探索提示词失败:', error);
        res.json({ success: false, message: '保存提示词失败' });
    }
});

// Facebook关键词管理 API
const facebookKeywordsFile = path.join(__dirname, 'data', 'facebook_keywords.txt');

function loadFacebookKeywords() {
    try {
        if (!fs.existsSync(facebookKeywordsFile)) {
            // 创建默认关键词
            const defaultKeywords = ['AI技术', '人工智能', '机器学习', '深度学习', '大模型', 'AI应用', '技术创新', '科技创业'];
            fs.writeFileSync(facebookKeywordsFile, defaultKeywords.join('\n'), 'utf8');
            return defaultKeywords;
        }
        const content = fs.readFileSync(facebookKeywordsFile, 'utf8');
        return content.split('\n').filter(line => line.trim().length > 0);
    } catch (error) {
        console.error('读取Facebook关键词失败:', error);
        return [];
    }
}

function saveFacebookKeywords(keywords) {
    try {
        fs.writeFileSync(facebookKeywordsFile, keywords.join('\n'), 'utf8');
        return true;
    } catch (error) {
        console.error('保存Facebook关键词失败:', error);
        return false;
    }
}

app.get('/api/facebook/keywords', (req, res) => {
    try {
        const keywords = loadFacebookKeywords();
        res.json({
            success: true,
            data: { keywords }
        });
    } catch (error) {
        console.error('获取Facebook关键词失败:', error);
        res.json({ success: false, message: '获取Facebook关键词失败' });
    }
});

app.post('/api/facebook/keywords', (req, res) => {
    try {
        const { keyword } = req.body;
        
        if (!keyword || keyword.trim() === '') {
            return res.json({ success: false, message: '请输入有效的关键词' });
        }
        
        const keywords = loadFacebookKeywords();
        
        if (keywords.includes(keyword.trim())) {
            return res.json({ success: false, message: '关键词已存在' });
        }
        
        keywords.push(keyword.trim());
        
        if (saveFacebookKeywords(keywords)) {
            console.log('Facebook关键词添加成功:', keyword);
            res.json({ success: true, message: '关键词添加成功' });
        } else {
            res.json({ success: false, message: '保存关键词失败' });
        }
    } catch (error) {
        console.error('添加Facebook关键词失败:', error);
        res.json({ success: false, message: '添加关键词失败' });
    }
});

app.put('/api/facebook/keywords', (req, res) => {
    try {
        const { oldKeyword, newKeyword } = req.body;
        
        if (!oldKeyword || !newKeyword || oldKeyword.trim() === '' || newKeyword.trim() === '') {
            return res.json({ success: false, message: '请输入有效的关键词' });
        }
        
        const keywords = loadFacebookKeywords();
        const index = keywords.indexOf(oldKeyword);
        
        if (index === -1) {
            return res.json({ success: false, message: '原关键词不存在' });
        }
        
        if (keywords.includes(newKeyword.trim()) && oldKeyword !== newKeyword.trim()) {
            return res.json({ success: false, message: '新关键词已存在' });
        }
        
        keywords[index] = newKeyword.trim();
        
        if (saveFacebookKeywords(keywords)) {
            console.log('Facebook关键词更新成功:', oldKeyword, '→', newKeyword);
            res.json({ success: true, message: '关键词更新成功' });
        } else {
            res.json({ success: false, message: '保存关键词失败' });
        }
    } catch (error) {
        console.error('更新Facebook关键词失败:', error);
        res.json({ success: false, message: '更新关键词失败' });
    }
});

app.delete('/api/facebook/keywords/:keyword', (req, res) => {
    try {
        const keyword = decodeURIComponent(req.params.keyword);
        
        if (!keyword || keyword.trim() === '') {
            return res.json({ success: false, message: '请输入有效的关键词' });
        }
        
        const keywords = loadFacebookKeywords();
        const updatedKeywords = keywords.filter(k => k !== keyword);
        
        if (updatedKeywords.length === keywords.length) {
            return res.json({ success: false, message: '关键词不存在' });
        }
        
        if (saveFacebookKeywords(updatedKeywords)) {
            console.log('Facebook关键词删除成功:', keyword);
            res.json({ success: true, message: '关键词删除成功' });
        } else {
            res.json({ success: false, message: '保存关键词失败' });
        }
    } catch (error) {
        console.error('删除Facebook关键词失败:', error);
        res.json({ success: false, message: '删除关键词失败' });
    }
});

// 私信维护管理 API
const sixinStatsFile = path.join(__dirname, 'data', 'sixin_stats.json');

function loadSixinStats() {
    try {
        if (!fs.existsSync(sixinStatsFile)) {
            const defaultStats = {
                pendingCount: 10,
                todayCount: 0,
                totalCount: 0,
                successCount: 0,
                lastMaintenance: null
            };
            fs.writeFileSync(sixinStatsFile, JSON.stringify(defaultStats, null, 2), 'utf8');
            return defaultStats;
        }
        const content = fs.readFileSync(sixinStatsFile, 'utf8');
        return JSON.parse(content);
    } catch (error) {
        console.error('读取私信维护统计失败:', error);
        return {
            pendingCount: 0,
            todayCount: 0,
            totalCount: 0,
            successCount: 0,
            lastMaintenance: null
        };
    }
}

function saveSixinStats(stats) {
    try {
        fs.writeFileSync(sixinStatsFile, JSON.stringify(stats, null, 2), 'utf8');
        return true;
    } catch (error) {
        console.error('保存私信维护统计失败:', error);
        return false;
    }
}

app.get('/api/sixin/status', (req, res) => {
    try {
        const stats = loadSixinStats();
        const successRate = stats.totalCount > 0 ? Math.round((stats.successCount / stats.totalCount) * 100) + '%' : '0%';
        
        res.json({
            success: true,
            data: {
                pendingCount: stats.pendingCount,
                todayCount: stats.todayCount,
                totalCount: stats.totalCount,
                successRate: successRate
            }
        });
    } catch (error) {
        console.error('获取私信维护状态失败:', error);
        res.json({ success: false, message: '获取私信维护状态失败' });
    }
});

app.post('/api/sixin/maintain', async (req, res) => {
    try {
        console.log('开始执行私信维护任务');
        
        // 动态导入私信维护技能
        const { maintainSixin } = await import('./skills/sixin/sixin-maintenance.ts');
        
        const input = {
            skillId: 'sixin-maintenance',
            traceId: `sixin-maintenance-${Date.now()}`
        };
        
        const result = await maintainSixin(input);
        
        // 更新统计数据
        const stats = loadSixinStats();
        stats.totalCount += result.data.processedCount;
        stats.successCount += result.data.successCount;
        
        // 更新今日维护数（简单实现，实际应该按日期统计）
        const today = new Date().toISOString().split('T')[0];
        if (!stats.lastMaintenance || stats.lastMaintenance !== today) {
            stats.todayCount = result.data.processedCount;
            stats.lastMaintenance = today;
        } else {
            stats.todayCount += result.data.processedCount;
        }
        
        // 更新待处理数
        stats.pendingCount = Math.max(0, stats.pendingCount - result.data.processedCount);
        
        saveSixinStats(stats);
        
        console.log('私信维护任务执行完成');
        res.json({
            success: true,
            data: {
                results: result.data.results
            }
        });
    } catch (error) {
        console.error('执行私信维护任务失败:', error);
        res.json({ success: false, message: '执行私信维护任务失败' });
    }
});

// 文生图管理 API
const imageApiKeyFile = path.join(__dirname, 'data', 'qwen-image-2.0key.txt');

app.get('/api/image/api-key', (req, res) => {
    try {
        let apiKey = '';
        let lastModified = '';
        
        if (fs.existsSync(imageApiKeyFile)) {
            apiKey = fs.readFileSync(imageApiKeyFile, 'utf8').trim();
            
            // 获取文件最后修改时间
            const stats = fs.statSync(imageApiKeyFile);
            const mtime = stats.mtime;
            // 格式化时间为 YYYY/MM/DD HH:mm:ss
            lastModified = `${mtime.getFullYear()}/${(mtime.getMonth() + 1)}/${mtime.getDate()} ${mtime.getHours().toString().padStart(2, '0')}:${mtime.getMinutes().toString().padStart(2, '0')}:${mtime.getSeconds().toString().padStart(2, '0')}`;
        }
        
        res.json({
            success: true,
            data: {
                apiKey: apiKey,
                lastModified: lastModified
            }
        });
    } catch (error) {
        console.error('读取文生图API Key失败:', error);
        res.json({ success: false, message: '读取API Key失败' });
    }
});

app.post('/api/image/api-key', (req, res) => {
    try {
        const { apiKey } = req.body;
        
        if (!apiKey || apiKey.trim() === '') {
            return res.json({ success: false, message: 'API Key不能为空' });
        }
        
        // 确保data目录存在
        const dataDir = path.dirname(imageApiKeyFile);
        if (!fs.existsSync(dataDir)) {
            fs.mkdirSync(dataDir, { recursive: true });
        }
        
        fs.writeFileSync(imageApiKeyFile, apiKey.trim(), 'utf8');
        console.log('文生图API Key保存成功');
        res.json({ success: true, message: 'API Key保存成功' });
    } catch (error) {
        console.error('保存文生图API Key失败:', error);
        res.json({ success: false, message: '保存API Key失败' });
    }
});

app.post('/api/image/generate', async (req, res) => {
    try {
        const { prompt } = req.body;
        
        if (!prompt || prompt.trim() === '') {
            return res.json({ success: false, message: '提示词不能为空' });
        }
        
        console.log('开始执行文生图任务');
        
        // 动态导入文生图技能
        const { generateImageSkill } = await import('./skills/image/image-generation.ts');
        
        const input = {
            skillId: 'image-generation',
            traceId: `image-generation-${Date.now()}`,
            prompt: prompt.trim()
        };
        
        const result = await generateImageSkill(input);
        
        if (result.code === 0) {
            console.log('文生图任务执行完成');
            res.json({
                success: true,
                data: {
                    imagePath: result.data.imagePath,
                    imageUrl: result.data.imageUrl
                }
            });
        } else {
            console.error('文生图任务执行失败');
            res.json({ success: false, message: '生成图片失败' });
        }
    } catch (error) {
        console.error('执行文生图任务失败:', error);
        res.json({ success: false, message: '执行文生图任务失败' });
    }
});

// 评论区截留管理 API
const pinglunciDir = path.join(__dirname, 'pinglunci');

// 确保pinglunci目录存在
if (!fs.existsSync(pinglunciDir)) {
    fs.mkdirSync(pinglunciDir, { recursive: true });
}

const searchKeywordsFile = path.join(pinglunciDir, 'ss.txt');
const targetKeywordsFile = path.join(pinglunciDir, 'pinlunci.txt');
const replyContentsFile = path.join(pinglunciDir, 'huifu.txt');

// 读取搜索关键词
app.get('/api/comment/search-keywords', (req, res) => {
    try {
        let content = '';
        if (fs.existsSync(searchKeywordsFile)) {
            content = fs.readFileSync(searchKeywordsFile, 'utf8');
        }
        res.json({
            success: true,
            data: {
                content: content
            }
        });
    } catch (error) {
        console.error('读取搜索关键词失败:', error);
        res.json({ success: false, message: '读取文件失败' });
    }
});

// 保存搜索关键词
app.post('/api/comment/search-keywords', (req, res) => {
    try {
        const { content } = req.body;
        
        fs.writeFileSync(searchKeywordsFile, content || '', 'utf8');
        console.log('搜索关键词保存成功');
        res.json({ success: true, message: '保存成功' });
    } catch (error) {
        console.error('保存搜索关键词失败:', error);
        res.json({ success: false, message: '保存失败' });
    }
});

// 读取目标关键词
app.get('/api/comment/target-keywords', (req, res) => {
    try {
        let content = '';
        if (fs.existsSync(targetKeywordsFile)) {
            content = fs.readFileSync(targetKeywordsFile, 'utf8');
        }
        res.json({
            success: true,
            data: {
                content: content
            }
        });
    } catch (error) {
        console.error('读取目标关键词失败:', error);
        res.json({ success: false, message: '读取文件失败' });
    }
});

// 保存目标关键词
app.post('/api/comment/target-keywords', (req, res) => {
    try {
        const { content } = req.body;
        
        fs.writeFileSync(targetKeywordsFile, content || '', 'utf8');
        console.log('目标关键词保存成功');
        res.json({ success: true, message: '保存成功' });
    } catch (error) {
        console.error('保存目标关键词失败:', error);
        res.json({ success: false, message: '保存失败' });
    }
});

// 读取回复内容
app.get('/api/comment/reply-contents', (req, res) => {
    try {
        let content = '';
        if (fs.existsSync(replyContentsFile)) {
            content = fs.readFileSync(replyContentsFile, 'utf8');
        }
        res.json({
            success: true,
            data: {
                content: content
            }
        });
    } catch (error) {
        console.error('读取回复内容失败:', error);
        res.json({ success: false, message: '读取文件失败' });
    }
});

// 保存回复内容
app.post('/api/comment/reply-contents', (req, res) => {
    try {
        const { content } = req.body;
        
        fs.writeFileSync(replyContentsFile, content || '', 'utf8');
        console.log('回复内容保存成功');
        res.json({ success: true, message: '保存成功' });
    } catch (error) {
        console.error('保存回复内容失败:', error);
        res.json({ success: false, message: '保存失败' });
    }
});

// 登录管理 API
app.post('/api/login', async (req, res) => {
    try {
        const { platform, action } = req.body;
        
        if (!platform || !action) {
            return res.json({ success: false, message: '参数不能为空' });
        }
        
        console.log(`开始执行${platform}登录任务，操作: ${action}`);
        
        // 动态导入登录技能
        const { loginSkill } = await import('./skills/login/login-skill.ts');
        
        const input = {
            skillId: 'login-skill',
            traceId: `login-${Date.now()}`,
            platform: platform,
            action: action
        };
        
        const result = await loginSkill(input);
        
        if (result.code === 0) {
            console.log(`${platform}登录任务执行完成`);
            res.json({
                success: true,
                message: result.data.message,
                data: result.data
            });
        } else {
            console.error(`${platform}登录任务执行失败`);
            res.json({ success: false, message: result.data.message });
        }
    } catch (error) {
        console.error('执行登录任务失败:', error);
        res.json({ success: false, message: '执行任务失败' });
    }
});

// 任务管理 API
app.get('/api/tasks', (req, res) => {
    try {
        const tasks = loadTasks();
        const taskStatus = loadTaskStatus();
        
        // 合并任务和执行状态
        const tasksWithStatus = tasks.map(task => ({
            ...task,
            status: taskStatus[task.id] || { status: 'scheduled' }
        }));
        
        res.json({ success: true, tasks: tasksWithStatus });
    } catch (error) {
        console.error('获取任务失败:', error);
        res.json({ success: false, message: '获取任务失败' });
    }
});

app.post('/api/tasks', (req, res) => {
    try {
        const { time, skill } = req.body;
        
        if (!time || !skill) {
            return res.json({ success: false, message: '请提供执行时间和技能' });
        }
        
        const tasks = loadTasks();
        const newTask = {
            id: `task-${Date.now()}`,
            time,
            skill
        };
        
        tasks.push(newTask);
        saveTasks(tasks);
        scheduleTask(newTask);
        
        res.json({ success: true, task: newTask });
    } catch (error) {
        console.error('添加任务失败:', error);
        res.json({ success: false, message: '添加任务失败' });
    }
});

app.delete('/api/tasks/:id', (req, res) => {
    try {
        const taskId = req.params.id;
        const tasks = loadTasks();
        const updatedTasks = tasks.filter(task => task.id !== taskId);
        
        if (updatedTasks.length === tasks.length) {
            return res.json({ success: false, message: '任务不存在' });
        }
        
        // 取消任务调度
        if (taskJobs.has(taskId)) {
            taskJobs.get(taskId).cancel();
            taskJobs.delete(taskId);
        }
        
        saveTasks(updatedTasks);
        res.json({ success: true });
    } catch (error) {
        console.error('删除任务失败:', error);
        res.json({ success: false, message: '删除任务失败' });
    }
});

// 启动服务器
app.listen(port, () => {
    console.log(`服务器运行在 http://localhost:${port}`);
});
