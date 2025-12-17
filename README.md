# SessionCast CLI

Private Node.js agent and CLI for SessionCast - a real-time terminal sharing platform.

## Features

### Agent
- **Auto-discovery**: Automatically detects and connects tmux sessions
- **Real-time screen capture**: Streams terminal output with gzip compression
- **Circuit breaker**: Prevents reconnection storms with exponential backoff
- **Interactive control**: Supports keyboard input, resize, and session management
- **API integration**: External command execution and LLM service support

### CLI Commands
- `sessioncast login <api-key>` - Authenticate with API key
- `sessioncast logout` - Clear stored credentials
- `sessioncast status` - Check authentication status
- `sessioncast agents` - List registered agents
- `sessioncast list [agent]` - List tmux sessions
- `sessioncast send <target> <keys>` - Send keys to a session
- `sessioncast agent` - Start the agent

## Installation

```bash
# Clone the repository
git clone git@github.com:your-org/sessioncast-cli.git
cd sessioncast-cli

# Install dependencies
npm install

# Build
npm run build

# Link globally (optional)
npm link
```

## Configuration

Create `~/.sessioncast.yml` or `~/.tmux-remote.yml`:

```yaml
machineId: my-machine
relay: wss://your-relay.sessioncast.io/ws
token: agt_your_agent_token_here

# Optional: API configuration
api:
  enabled: true
  agentId: "your-agent-uuid"

  exec:
    enabled: true
    shell: /bin/bash
    workingDir: /home/user
    defaultTimeout: 30000

  llm:
    enabled: false
    provider: ollama
    model: codellama
    endpoint: http://localhost:11434
```

### Environment Variables

- `SESSIONCAST_CONFIG` - Custom config file path
- `TMUX_REMOTE_CONFIG` - Alternative config file path

## Usage

### Start the Agent

```bash
# Run agent (foreground)
sessioncast agent

# Run agent (background)
nohup sessioncast agent > /tmp/sessioncast-agent.log 2>&1 &
```

### Send Keys to Session

```bash
# Send text to a session
sessioncast send my-machine/dev "ls -la"

# Send special keys
sessioncast send my-machine/dev "Enter"
```

## Architecture

```
┌─────────────┐     WebSocket      ┌─────────────┐     WebSocket     ┌─────────────┐
│   Agent     │ ◄─────────────────► │   Relay     │ ◄────────────────► │   Viewer    │
│  (Node.js)  │    screen/keys     │  (Spring)   │    screen/keys    │   (Web)     │
└─────────────┘                    └─────────────┘                   └─────────────┘
      │                                   │
      │ tmux                              │ DynamoDB
      ▼                                   ▼
┌─────────────┐                    ┌─────────────┐
│   tmux      │                    │  Sessions   │
│  sessions   │                    │  metadata   │
└─────────────┘                    └─────────────┘
```

## Development

```bash
# Install dependencies
npm install

# Build TypeScript
npm run build

# Watch mode (if configured)
npm run dev
```

## Project Structure

```
sessioncast-cli/
├── src/
│   ├── agent/
│   │   ├── api-client.ts      # API WebSocket client
│   │   ├── exec-service.ts    # Command execution service
│   │   ├── llm-service.ts     # LLM integration (Ollama/OpenAI)
│   │   ├── runner.ts          # Agent runner with auto-discovery
│   │   ├── session-handler.ts # tmux session handler
│   │   ├── tmux.ts            # tmux utilities
│   │   ├── types.ts           # Type definitions
│   │   └── websocket.ts       # WebSocket client with circuit breaker
│   ├── commands/
│   │   ├── agent.ts           # Agent command
│   │   ├── agents.ts          # List agents command
│   │   ├── login.ts           # Login command
│   │   ├── sendkeys.ts        # Send keys command
│   │   └── sessions.ts        # List sessions command
│   ├── api.ts                 # API client
│   ├── config.ts              # Configuration management
│   └── index.ts               # CLI entry point
├── package.json
├── tsconfig.json
└── README.md
```

## Circuit Breaker

The agent implements a circuit breaker pattern to prevent reconnection storms:

- **Max reconnect attempts**: 5
- **Base delay**: 1 second
- **Max delay**: 30 seconds (with exponential backoff + jitter)
- **Circuit breaker duration**: 2 minutes cooldown after max attempts

## License

Private - All rights reserved.
