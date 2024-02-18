import express from 'express'
import { generateSlug } from "random-word-slugs"
import {ECSClient,RunTaskCommand} from '@aws-sdk/client-ecs'
import { Server } from 'socket.io';
import {Redis} from 'ioredis'
import * as dotenv from 'dotenv'

dotenv.config()

const app=express();
const PORT=process.env.PORT;
const SOCKET_PORT=process.env.SOCKET_PORT;

const ecsClient=new ECSClient({
    region:process.env.REGION,
    credentials:{
        accessKeyId:process.env.ACCESS_KEY_ID,
        secretAccessKey:process.env.SECRET_ACCESS_KEY
    }
})
const subsriber=new Redis(process.env.REDIS_URI)
const io=new Server({cors:'*'})

io.on('connection',(socket)=>{
    socket.on('subscribe',(channel)=>{
        socket.join(channel);
        socket.emit('message',`Joined ${channel}`)
    })
})

io.listen(SOCKET_PORT,()=>{
    console.log(`Socket Server listen on Port ${SOCKET_PORT}`)
})

const config={
    CLUSTER:process.env.ECS_CLUSTER,
    TASK:process.env.ECS_TASK
}

app.use(express.json())

app.post('/project',async(req,res)=>{
    const {gitUrl,slug}=req.body;
    const projectSlug=slug?slug:generateSlug();

    const command=new RunTaskCommand({
        cluster:config.CLUSTER,
        taskDefinition:config.TASK,
        launchType:"FARGATE",
        count: 1,
        networkConfiguration: {
            awsvpcConfiguration: {
                assignPublicIp: 'ENABLED',
                subnets: [process.env.SUBNET_1, process.env.SUBNET_2, process.env.SUBNET_3],
                securityGroups: [process.env.SECURITY_GROUP_ID]
            }
        },
        overrides: {
            containerOverrides: [
                {
                    name: 'build-image',
                    environment: [
                        { name: 'GIT_REPOSITORY__URL', value: gitUrl },
                        { name: 'PROJECT_ID', value: projectSlug }
                    ]
                }
            ]
        }
    })

    await ecsClient.send(command)

    return res.json({staus:200,url:`http://${projectSlug}.localhost:8000`})
})

async function initRedisSubscribe(){
    console.log("Subscribe to Log")
    subsriber.psubscribe('logs:*')
    subsriber.on('pmessage',(pattern,channel,message)=>{
        io.to(channel).emit("message",message)
    })
}

initRedisSubscribe();

app.listen(PORT,()=>{
    console.log(`App listens on PORT..${PORT}`)
})