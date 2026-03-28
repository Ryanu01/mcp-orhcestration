import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js"
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { WebClient } from "@slack/web-api"
import { Octokit } from "@octokit/rest"
import { GITHUB_TOKEN, SLACK_TOKEN } from "./config.js";

const transport = new StdioServerTransport();
const octokit = new Octokit({
    auth: GITHUB_TOKEN
})

const slackClient = new WebClient(SLACK_TOKEN)

const server = new McpServer({
    name: "agent-orchestration",
    version: "1.0.0",
});



server.registerTool(
    "create_issue",
    {
        description: "Create a GitHub issue",
        inputSchema: {
            owner: z.string(),
            repo: z.string(),
            title: z.string(),
            body: z.string(),
        }
    },
    async ({ owner, repo, title, body }) => {
        try {
            const response = await octokit.issues.create({
                owner, 
                repo, 
                title, 
                body
            })

            return {
                content: [
                    {
                        type: "text",
                        text: `Issue created: ${response.data.html_url}`
                    }
                ]
            }
        } catch (error) {
            return {
                content: [
                    {
                        type: "text",
                        text: `Error occured`
                    }
                ]
            }
        }
    }
)

server.registerTool(
    "send_message",
    {
        description: "Send a message to a Slack channel",
        inputSchema: {
            channel: z.string(),
            text: z.string()
        }
    },
    async ({ channel, text }) => {
        try {
            await slackClient.chat.postMessage({
                channel,
                text
            })

            return {
                content: [
                    {
                        type: "text",
                        text: "MEssage sent"
                    }
                ]
            }
        } catch (error) {
            return {
                content: [
                    {
                        type: "text",
                        text: "MEssage not sent"
                    }
                ]
            }
        }
    }
)

server.connect(transport);

