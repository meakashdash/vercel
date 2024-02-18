import path from 'path'
import {exec} from 'child_process'
import fs from 'fs'
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import mime from 'mime-types';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import Redis from 'ioredis'
import * as dotenv from 'dotenv'

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const s3Client=new S3Client({
    region:process.env.REGION,
    credentials:{
        accessKeyId:process.env.ACCESS_KEY_ID,
        secretAccessKey:process.env.SECRET_ACCESS_KEY
    }
})

const publisher=new Redis(process.env.REDIS_URI)

const PROJECT_ID=process.env.PROJECT_ID;

function publishLogs(logs){
    publisher.publish(`logs:${PROJECT_ID}`,JSON.stringify({logs}))
}

async function init(){
    try {
        const outputPath=path.join(__dirname,'output');
        const p=exec(`cd ${outputPath} && npm install && npm run build`)
        publishLogs('Build Started')
        p.stdout.on('data',(data)=>{
            console.log(data.toString())
            publishLogs(data.toString())
        })
    
        p.stderr.on('error',(error)=>{
            console.log(error.toString())
            publishLogs(`error: ${data.toString()}`)
        })
    
        p.on('close',async()=>{
            console.log("Build Completed")
            publishLogs("Build Completed")
            const distFolderPath=path.join(__dirname,'output','dist')
            const distFolderContent=fs.readdirSync(distFolderPath,{recursive:true})
            for(const file of distFolderContent){
                const filePath=path.join(distFolderPath,file);
                if (fs.lstatSync(filePath).isDirectory()) continue;
    
                console.log('uploading',filePath)
                publishLogs(`uploading ${filePath}`)
    
                const command=new PutObjectCommand({
                    Bucket:process.env.BUCKET,
                    Key:`__outputs/${PROJECT_ID}/${file}`,
                    Body: fs.createReadStream(filePath),
                    ContentType: mime.lookup(filePath)
                })
    
                await s3Client.send(command)

                publishLogs(`uploaded ${filePath}`)
                console.log('uploaded',filePath)
    
            }
        })
    } catch (error) {
        console.log(error)
    }
}

init();