const Koa = require("koa")
const router = require("koa-router")()
const jsonp = require("koa-jsonp")
const bodyparser = require('koa-bodyparser');

const { Client } = require("@notionhq/client")
require("dotenv").config();

const app = new Koa()

//使用中间件
app.use(jsonp())//json数据
app.use(bodyparser())//获取请求体数据，要支持文件上传，可以使用better-body-parser这个包

//环境变量配置
const NOTION_TOKEN = process.env.NOTION_TOKEN
const NOTION_DB_ID = process.env.NOTION_DB_ID
const NOTION_CURR_USER_ID = process.env.NOTION_CURR_USER_ID

const notion = new Client({ auth: NOTION_TOKEN })


router.get("/comments", async (ctx, next) => {
    //获取列表数据
    const result = await notion.databases.query({ database_id: NOTION_DB_ID })
    const comments = new Map()
    //解构数据
    result?.results?.forEach(item => {
        comments.set(item.id, {
            id: item.id,
            user: item.properties.user.rich_text[0].text.content,
            content: item.properties.content.rich_text[0].text.content,
            time: formatTimeDesc(item.properties.time.created_time),
            avatar: item.properties.avatar.files[0].file.url,
            replies: item.properties.replies.relation,
            replyTo: item.properties.replyTo?.relation[0]?.id
        })
    })

    //重新组装，把关系ID替换为真实数据
    let commentsPopulated = [...comments.values()].reduce((acc, curr) => {
        if (!curr.replyTo) {
            curr.replies = curr.replies.map((reply) => comments.get(reply.id))
            acc.push(curr)
        }
        return acc
    }, [])

    ctx.body = result
    return commentsPopulated
})

//格式化时间描述
function formatTimeDesc (time) {
    const currInMs = new Date().getTime()
    const timeInMs = new Date(time).getTime()

    const minuteInMs = 60 * 1000
    const hourInMs = 60 * minuteInMs
    const dayInMs = 24 * hourInMs
    const monthInMs = 30 * dayInMs
    const yearInMs = 12 * monthInMs

    const relativeTime = currInMs - timeInMs
    if (relativeTime < minuteInMs) {
        return `${Math.ceil(relativeTime / 1000)}秒前`
    } else if (relativeTime < hourInMs) {
        return `${Math.ceil(relativeTime / minuteInMs)}分钟前`
    } else if (relativeTime < dayInMs) {
        return `${Math.ceil(relativeTime / hourInMs)}小时前`
    } else if (relativeTime < monthInMs) {
        return `${Math.ceil(relativeTime / dayInMs)}天前`
    } else if (relativeTime < yearInMs) {
        return `${Math.ceil(relativeTime / monthInMs)}个月前`
    } else {
        return `${Math.ceil(relativeTime / yearInMs)}年前`
    }
}

//添加函数
async function addComment ({ content, replyTo = "" }) {
    let no = (await notion.databases.query({ database_id: NOTION_DB_ID })).results.length + 1;
    let { avatar_url, name } = await notion.users.retrieve({
        user_id: NOTION_CURR_USER_ID,
    });

    notion.request({
        method: "POST",
        path: "pages",
        body: {
            parent: { database_id: NOTION_DB_ID },
            properties: {
                no: {
                    title: [
                        {
                            text: {
                                content: no.toString(),
                            },
                        },
                    ],
                },
                user: {
                    rich_text: [
                        {
                            text: {
                                content: name,
                            },
                        },
                    ],
                },
                avatar: {
                    url: avatar_url,
                },
                content: {
                    rich_text: [
                        {
                            text: {
                                content,
                            },
                        },
                    ],
                },
                // 如果有 replyTO 参数传递进来的，再添加到请求 body 中
                ...(replyTo && {
                    replyTo: {
                        relation: [
                            {
                                id: replyTo,
                            },
                        ],
                    },
                }),
            },
        },
    });
}

function transformPageObject (page) {
    return {
        id: page.id,
        user: page.properties.user.rich_text[0].text.content,
        time: getRelativeTimeDesc(page.properties.time.created_time),
        content: page.properties.content.rich_text[0].text.content,
        avatar: page.properties.avatar.url,
        replies: page.properties.replies.relation,
        replyTo: page.properties.replyTo?.relation[0]?.id,
    };
}

router.post("/comments", async (ctx, next) => {
    ctx.response.type = 'application/json';
    console.log(ctx.request.body)
    try {
        await addComment(ctx.request.body);
        ctx.response.status = 201
    } catch (error) {
        console.log(error);
        ctx.response.status = 500
    }
})

app.use(router.routes())

app.listen(3001)