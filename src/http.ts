import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js"
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { z } from "zod";
import { Octokit } from "@octokit/rest"
import { OAuthApp } from "@octokit/oauth-app"
import express from "express";
import { GITHUB_CLIENT_ID, GITHUB_CLIENT_SECRET } from "./config.js";

const app = express();
app.use(express.json());

const oauthApp = new OAuthApp({
    clientType: "oauth-app",
    clientId: GITHUB_CLIENT_ID!,
    clientSecret: GITHUB_CLIENT_SECRET!,
});

const sessions = new Map<string, { octokit: Octokit; token: string }>();
const mcpToOAuth = new Map<string, string>();

app.get("/", (req, res) => {
    res.send(`
        <html>
            <body>
                <h1>MCP GitHub Server</h1>
                <p>To authenticate, visit <a href="/login">/login</a> with your MCP session ID:</p>
                <code>/login?mcp_session_id=YOUR_MCP_SESSION_ID</code>
                <p>Or just <a href="/login">/login</a> for a new OAuth session.</p>
            </body>
        </html>
    `);
});

app.get("/login", async (req, res) => {
    const { mcp_session_id } = req.query;

    const { url } = oauthApp.getWebFlowAuthorizationUrl({
        scopes: ["repo"],
        state: mcp_session_id as string
    });
    res.redirect(url);
});

app.get("/callback", async (req, res) => {
    const { code, state } = req.query;
    const mcp_session_id = state;

    if (!code || typeof code !== "string") {
        res.status(400).send("Missing code parameter");
        return;
    }

    const { authentication } = await oauthApp.createToken({
        code,
    });

    const oauthSessionId = Math.random().toString(36).substring(7);
    sessions.set(oauthSessionId, {
        octokit: new Octokit({ auth: authentication.token }),
        token: authentication.token,
    });

    if (mcp_session_id && typeof mcp_session_id === "string") {
        mcpToOAuth.set(mcp_session_id, oauthSessionId);
    }

    res.send(`
        <html>
            <body>
                <h1>Authenticated!</h1>
                <p>OAuth Session ID: ${oauthSessionId}</p>
                ${mcp_session_id ? `<p>MCP Session linked: ${mcp_session_id}</p>` : ""}
                <p>Use this session ID in your MCP client to make authenticated requests.</p>
            </body>
        </html>
    `);
});

const server = new McpServer({
    name: "agent-orchestration-http",
    version: "1.0.0",
});

server.registerTool(
    "create_issue",
    {
        description: `Create a GitHub issue whatever is the user prompt enchance the
        issue description and in response only give a message that issue is created with
        the issue link` ,
        inputSchema: {
            owner: z.string(),
            repo: z.string(),
            title: z.string(),
            body: z.string(),
        }
    },
    async ({ owner, repo, title, body }, extra) => {
        try {
            const mcpSessionId = extra?.sessionId;
            if (!mcpSessionId) {
                return {
                    content: [
                        {
                            type: "text",
                            text: "No MCP session. Please initialize first."
                        }
                    ]
                };
            }

            const oauthSessionId = mcpToOAuth.get(mcpSessionId);
            if (!oauthSessionId || !sessions.has(oauthSessionId)) {
                return {
                    content: [
                        {
                            type: "text",
                            text: "Not authenticated. Please login at /login?mcp_session_id=" + mcpSessionId
                        }
                    ]
                };
            }

            const session = sessions.get(oauthSessionId)!;
            const response = await session.octokit.issues.create({
                owner,
                repo,
                title,
                body
            });

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
                        text: `Error occured: ${error}`
                    }
                ]
            }
        }
    }
);

let transport: StreamableHTTPServerTransport;

app.post("/mcp", async (req, res) => {
    if (!transport) {
        transport = new StreamableHTTPServerTransport({
            sessionIdGenerator: () => Math.random().toString(36).substring(7),
        });
        // @ts-expect-error 
        await server.connect(transport);
    }
    console.log(transport);
    
    await transport.handleRequest(req, res, req.body);
});

const PORT = 8080;
app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
});

