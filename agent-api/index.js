// agent-api/index.js
const express = require('express');
const { exec } = require('child_process');
const fs = require('fs');
const path = require('path');
const axios = require('axios');
const app = express();
const crypto = require('crypto');
const { Anthropic } = require('@anthropic-ai/sdk');
const { SYSTEM_PROMPT } = require('./prompts/system_prompt');
require('dotenv').config()

app.use(express.json());

const CONTEXT_DIR = path.join(__dirname, 'context');
const MAX_CONTEXT_FILES = 100;       // keep at most 100 “memories”
if (!fs.existsSync(CONTEXT_DIR)) fs.mkdirSync(CONTEXT_DIR);

const anthropic = new Anthropic();

/**
 * Append a new “memory” to disk, pruning the oldest if we exceed MAX_CONTEXT_FILES.
 * @param {string} type   a short tag like 'user', 'plan', 'result'
 * @param {any}    data   JSON-serializable content
 */
function addContext(type, data) {
    // 1) prune oldest
    const files = fs.readdirSync(CONTEXT_DIR).sort();
    if (files.length >= MAX_CONTEXT_FILES) {
        fs.unlinkSync(path.join(CONTEXT_DIR, files[0]));
    }
    // 2) write new
    const timestamp = Date.now().toString().padStart(16, '0');
    const filename = `${timestamp}-${type}.json`;
    fs.writeFileSync(
        path.join(CONTEXT_DIR, filename),
        JSON.stringify(data, null, 2)
    );
}

/**
 * Retrieve the N most recent context entries.
 * You can bump N until you feel it fits within your LLM’s window.
 */
function getRecentContext(n = 10) {
    return fs.readdirSync(CONTEXT_DIR)
        .sort()
        .slice(-n)
        .map(f => JSON.parse(
            fs.readFileSync(path.join(CONTEXT_DIR, f), 'utf-8')
        ));
}


// 🧠 Agent endpoint
// app.post('/agent', async (req, res) => {
//     const prompt = req.body.prompt;
//     if (!prompt) return res.status(400).send('Missing prompt');

//     // 1) Save user prompt to context
//     addContext('user', { prompt, time: Date.now() });

//     // 2) Build message history for Claude
//     // const recent = getRecentContext(5);
//     // // const messages = [
//     // //     // You can insert a system message as the first item if you like:
//     // //     // { role: 'system', content: SYSTEM_PROMPT },
//     // //     // Inject saved memories as assistant messages:
//     // //     ...recent.map(m => ({ role: 'assistant', content: JSON.stringify(m) })),
//     // //     // Finally the user’s new prompt:
//     // //     { role: 'user', content: prompt },
//     // // ];

//     // // 1) Build recent-memory assistant messages
//     // const memoryMessages = recent.map(m => ({
//     //     role: 'assistant',
//     //     content: JSON.stringify(m)
//     // }));

//     // // 2) Build the user message
//     // const userMessage = { role: 'user', content: prompt };

//     // // 2) Build context summary for Claude
//     // const recent = getRecentContext(5);
//     // const contextSummary = recent.map(ctx =>
//     //     `[${ctx.type}] ${JSON.stringify(ctx.data)}`
//     // ).join('\n');



//     // // 3) Call Anthropic Claude
//     let planText;
//     try {
//         const resp = await anthropic.messages.create({
//             model: 'claude-opus-4-20250514',
//             max_tokens: 1024,
//             system: SYSTEM_PROMPT, // Move system prompt here
//             messages: [
//                 {
//                     role: 'user',
//                     content: prompt + ` [${Math.random()}]`
//                 }
//             ]
//         });
//         planText = resp.content[0].text.trim();
//     } catch (err) {
//         return res.status(500).send('Claude call failed: ' + err.message);
//     }

//     // 4) Save the plan back into context
//     addContext('plan', { plan: planText, time: Date.now() });

//     // 5) Split into commands and schedule each one
//     const commands = planText
//         .split('\n')
//         .map(l => l.trim())
//         .filter(l => l && !l.startsWith('#'));

//     const jobIds = [];
//     for (const cmd of commands) {
//         const { data } = await axios.post('http://localhost:3000/schedule', { cmd });
//         jobIds.push(data.jobId);
//     }

//     // 6) Return the plan and the jobs
//     res.json({ plan: commands, jobIds });
// });



app.post('/agent', async (req, res) => {
    const prompt = req.body.prompt;
    if (!prompt) return res.status(400).send('Missing prompt');

    addContext('user', { prompt, time: Date.now() });

    let planText;
    try {
        const resp = await anthropic.messages.create({
            model: 'claude-sonnet-4-20250514',
            max_tokens: 1024,
            system: SYSTEM_PROMPT,
            tools: [
                {
                    name: "run_shell_commands",
                    description: "Execute shell commands to accomplish tasks",
                    input_schema: {
                        type: "object",
                        properties: {
                            commands: {
                                type: "array",
                                items: {
                                    type: "string"
                                },
                                description: "Array of shell commands to execute"
                            }
                        },
                        required: ["commands"]
                    }
                }
            ],
            messages: [
                {
                    role: 'user',
                    content: prompt
                }
            ]
        });

        console.log('Claude raw response:', JSON.stringify(resp.content, null, 2));
        // Check if Claude used the function
        if (resp.content[0].type === 'tool_use') {
            const toolUse = resp.content[0];
            const commands = toolUse.input.commands;

            if (!Array.isArray(commands)) {
                // Claude did not return shell commands, fallback to text or error
                const planText = resp.content[0].text?.trim() || '';
                return res.status(400).json({
                    error: 'Claude did not return shell commands.',
                    response: planText
                });
            }

            console.log('Commands from function call:', commands);

            const combinedScript = commands.join('\n');


            // // Schedule the commands
            // const jobIds = [];
            // for (const cmd of commands) {
            //     const { data } = await axios.post('http://localhost:3000/schedule', { cmd });
            //     jobIds.push(data.jobId);
            // }

            // schedule one container to run the entire script
            const { data } = await axios.post('http://localhost:3000/schedule', {
                cmd: combinedScript
            });
            res.json({
                plan: commands,
                jobId: data.jobId    // only one ID now
            });



            addContext('plan', { plan: commands, time: Date.now() });
            // res.json({ plan: commands, jobIds });

        } else {
            // Claude responded with text instead of function call
            planText = resp.content[0].text.trim();
            res.json({ response: planText, plan: [], jobIds: [] });
        }

    } catch (err) {
        console.error('Claude error:', err.response ? err.response.data : err);
        return res.status(500).send('Claude call failed: ' + err.message);
    }
});




// const JOBS_DIR = path.join(__dirname, 'jobs');

// if (!fs.existsSync(JOBS_DIR)) fs.mkdirSync(JOBS_DIR);

// app.post('/schedule', (req, res) => {
//     const task = req.body.cmd;
//     if (!task) return res.status(400).send("Missing 'cmd'");

//     const jobId = crypto.randomUUID();
//     const jobPath = path.join(JOBS_DIR, jobId);
//     fs.mkdirSync(jobPath);

//     const taskPath = path.join(jobPath, 'task.json');
//     fs.writeFileSync(taskPath, JSON.stringify({ cmd: task, status: 'pending' }));

//     const statusPath = path.join(jobPath, 'status.txt');
//     const outputPath = path.join(jobPath, 'output.txt');
//     const errorPath = path.join(jobPath, 'error.txt');

//     fs.writeFileSync(statusPath, 'running');
//     fs.writeFileSync(outputPath, '');
//     fs.writeFileSync(errorPath, '');

//     // ✅ Direct shell execution
//     exec(task, (err, stdout, stderr) => {
//         if (err) {
//             fs.writeFileSync(statusPath, 'error');
//             fs.writeFileSync(errorPath, stderr || err.message);
//         } else {
//             fs.writeFileSync(statusPath, 'done');
//             fs.writeFileSync(outputPath, stdout.trim());
//         }
//     });

//     res.json({ jobId });
// });

app.post('/schedule', async (req, res) => {
    const script = req.body.cmd;                   // ← Changed from 'script' to 'cmd'

    if (!script) {
        return res.status(400).json({ error: 'Missing cmd parameter' });
    }

    const jobId = Date.now().toString() + '-' + Math.random().toString(36).substr(2, 5);
    const jobDir = path.join(__dirname, 'jobs', jobId);

    try {
        fs.mkdirSync(jobDir, { recursive: true });

        // right after mkdir and before exec():
        const statusPath = path.join(jobDir, 'status.json');
        fs.writeFileSync(statusPath, JSON.stringify({
            status: 'running',
            startedAt: new Date().toISOString()
        }));



        const scriptPath = path.join(jobDir, 'run.sh');
        const scriptContent = `#!/bin/bash\nset -e\n${script}\n`;
        fs.writeFileSync(scriptPath, scriptContent, { mode: 0o755 });

        // Make it executable using fs.chmod
        fs.chmodSync(scriptPath, 0o755);

        const hostJobDir = `/tmp/coding-agent-jobs/${jobId}`;

        // Debug: Check if file exists before Docker
        console.log(`Job directory: ${jobDir}`);
        console.log(`Host job directory: ${hostJobDir}`);
        console.log(`Script exists: ${fs.existsSync(scriptPath)}`);
        console.log(`Script permissions: ${fs.statSync(scriptPath).mode.toString(8)}`);

        // Build the docker run command
        const dockerCmd = [
            'docker run --rm',
            `--memory=256m --cpus=0.5`,
            `-v "${hostJobDir}":/workspace`,  // Use HOST path, not container path
            '-w /workspace',
            'agent-runtime',
            'bash /workspace/run.sh'
        ].join(' ');

        console.log(`Executing: ${dockerCmd}`);

        exec(dockerCmd, { timeout: 5 * 60 * 1000 }, (err, stdout, stderr) => {
            const logFile = path.join(jobDir, 'output.log');
            const errorFile = path.join(jobDir, 'error.log');

            // Save output for later retrieval
            if (stdout) fs.writeFileSync(logFile, stdout);
            if (stderr) fs.writeFileSync(errorFile, stderr);


            if (err) {
                console.error(`Job ${jobId} failed:`, stderr);
                // Don't return here - the response might already be sent
            } else {
                console.log(`Job ${jobId} completed successfully`);
            }

            const finalStatus = err ? 'error' : 'done';
            const statusObj = {
                status: finalStatus,
                finishedAt: new Date().toISOString(),
                exitCode: err ? err.code : 0,
                ...(err && { error: stderr.trim() })
            };
            fs.writeFileSync(statusPath, JSON.stringify(statusObj, null, 2));
        });

        res.json({ jobId, status: 'scheduled' });

    } catch (error) {
        console.error('Error scheduling job:', error);
        res.status(500).json({ jobId, status: 'error', error: error.message });
    }
});



app.get('/status/:id', (req, res) => {
    const statusPath = path.join(__dirname, 'jobs', req.params.id, 'status.json');
    if (!fs.existsSync(statusPath)) {
        return res.status(404).json({ error: 'Job not found' });
    }
    const status = JSON.parse(fs.readFileSync(statusPath, 'utf-8'));
    // If done, you can also tack on a download URL:
    if (status.status === 'done') {
        status.downloadUrl = `/download/${req.params.id}/project.tar.gz`;
    }
    res.json(status);
});

app.get('/jobs', (req, res) => {
    const basePath = path.join(__dirname, 'jobs');

    if (!fs.existsSync(basePath)) {
        return res.send([]);
    }

    const jobs = fs.readdirSync(basePath)
        .filter(name => fs.existsSync(path.join(basePath, name, 'status.txt')))
        .map(id => {
            const status = fs.readFileSync(path.join(basePath, id, 'status.txt'), 'utf-8');
            const taskFile = path.join(basePath, id, 'task.json');
            const cmd = fs.existsSync(taskFile)
                ? JSON.parse(fs.readFileSync(taskFile, 'utf-8')).cmd
                : '';
            return { id, status, cmd };
        });

    res.send(jobs);
});


app.get('/jobs/:id/output', (req, res) => {
    const jobId = req.params.id;
    const outputPath = path.join(__dirname, 'jobs', jobId, 'output.txt');

    if (!fs.existsSync(outputPath)) {
        return res.status(404).send('Output not found');
    }

    const output = fs.readFileSync(outputPath, 'utf-8');
    res.send({ output });
});

app.get('/jobs/:id/error', (req, res) => {
    const jobId = req.params.id;
    const errorPath = path.join(__dirname, 'jobs', jobId, 'error.txt');

    if (!fs.existsSync(errorPath)) {
        return res.status(404).send('Error log not found');
    }

    const error = fs.readFileSync(errorPath, 'utf-8');
    res.send({ error });
});

app.get('/jobs/:id/logs', (req, res) => {
    const jobId = req.params.id;
    const basePath = path.join(__dirname, 'jobs', jobId);

    try {
        const task = JSON.parse(fs.readFileSync(path.join(basePath, 'task.json'), 'utf-8'));
        const status = fs.readFileSync(path.join(basePath, 'status.txt'), 'utf-8');
        const output = fs.existsSync(path.join(basePath, 'output.txt'))
            ? fs.readFileSync(path.join(basePath, 'output.txt'), 'utf-8')
            : '';
        const error = fs.existsSync(path.join(basePath, 'error.txt'))
            ? fs.readFileSync(path.join(basePath, 'error.txt'), 'utf-8')
            : '';

        res.send({ status, task: task.cmd, output, error });
    } catch (e) {
        res.status(500).send('Failed to read job logs');
    }
});



// 🐚 Run shell command
app.post('/shell', (req, res) => {
    const { cmd } = req.body;
    exec(cmd, (err, stdout, stderr) => {
        if (err) return res.status(500).send(stderr);
        res.send(stdout);
    });
});

// 🧠 Run Python code
app.post('/code/python', (req, res) => {
    const { code } = req.body;
    exec(`python3 -c "${code.replace(/"/g, '\\"')}"`, (err, stdout, stderr) => {
        if (err) return res.status(500).send(stderr);
        res.send(stdout);
    });
});

// 📂 File system read
app.get('/fs/read', (req, res) => {
    const { path } = req.query;
    fs.readFile(path, 'utf-8', (err, data) => {
        if (err) return res.status(404).send('Not found');
        res.send(data);
    });
});

// 💾 File system write
app.post('/fs/write', (req, res) => {
    const { path, content } = req.body;
    fs.writeFile(path, content, (err) => {
        if (err) return res.status(500).send('Failed to write');
        res.send('File written');
    });
});

// 🎯 GUI automation
app.post("/xdot", (req, res) => {
    const rawCmd = req.body.cmd;
    const safeCmd = rawCmd.replace(/"/g, '\\"'); // escape quotes
    const full = `
    DISPLAY=:0 xdotool search --onlyvisible --class xterm windowactivate --sync &&
    DISPLAY=:0 xdotool type "${safeCmd}" &&
    DISPLAY=:0 xdotool key Return
  `;
    exec(full, (err, stdout, stderr) => {
        if (err) {
            return res.status(500).json({ error: stderr });
        }
        res.json({ status: "ok", output: stdout });
    });
});

// 🗂 Download job output as tar.gz 
app.get('/download/:id/project.tar.gz', (req, res) => {
    const jobId = req.params.id;
    const jobDir = path.join(__dirname, 'jobs', jobId);

    if (!fs.existsSync(jobDir)) {
        return res.status(404).send('Job not found');
    }

    // Find the first directory inside jobDir (assume it's the project folder)
    const entries = fs.readdirSync(jobDir, { withFileTypes: true });
    const projectFolder = entries.find(e => e.isDirectory());
    if (!projectFolder) {
        return res.status(404).send('Project folder not found');
    }

    // const projectFolderPath = path.join(jobDir, projectFolder.name);
    const tarPath = path.join(jobDir, 'project.tar.gz');
    exec(`tar -czf "${tarPath}" -C "${jobDir}" "${projectFolder.name}"`, (err) => {
        if (err) {
            console.error('Tar error:', err);
            return res.status(500).send('Failed to create archive');
        }
        res.download(tarPath, `project-${jobId}.tar.gz`, (err) => {
            if (err) console.error('Download error:', err);
            fs.unlinkSync(tarPath); // Clean up after download
        });
    });
});




app.listen(3000, '0.0.0.0', () => {
    console.log('Listening on port 3000');
});
