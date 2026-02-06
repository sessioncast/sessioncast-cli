# SessionCast CLI

Node.js agent and CLI for [SessionCast](https://sessioncast.io) - a real-time terminal streaming platform.

## Installation

```bash
npm install -g sessioncast-cli
```

### Requirements
- Node.js 18+
- tmux (Linux/macOS) or [itmux](https://github.com/phayte/itmux) (Windows)

## Quick Start

```bash
# 1. Login (opens browser for Google OAuth)
sessioncast login

# 2. Start the agent
sessioncast agent

# 3. Open in browser
# https://app.sessioncast.io
```

That's it! Your tmux sessions will appear in the web console automatically.

## CLI Commands

| Command | Description |
|---------|-------------|
| `sessioncast login` | Login via browser (Google OAuth) |
| `sessioncast logout` | Clear stored credentials |
| `sessioncast status` | Check authentication status |
| `sessioncast agent` | Start the agent |
| `sessioncast agents` | List registered agents |
| `sessioncast list [agent]` | List tmux sessions |
| `sessioncast send <target> <keys>` | Send keys to a session |

## Manual Configuration (Self-hosted)

For self-hosted deployments, create `~/.sessioncast.yml`:

```yaml
machineId: my-machine
relay: wss://your-relay-server.com/ws
token: agt_your_agent_token_here
```

## Architecture

```
┌─────────────┐     WebSocket      ┌─────────────┐     WebSocket     ┌─────────────┐
│   Agent     │ <=================> │   Relay     │ <================> │   Viewer    │
│  (Node.js)  │    screen/keys     │  (Spring)   │    screen/keys    │   (Web)     │
└─────────────┘                    └─────────────┘                   └─────────────┘
      │
      │ tmux
      v
┌─────────────┐
│   tmux      │
│  sessions   │
└─────────────┘
```

## Features

- **Auto-discovery**: Automatically detects and connects tmux sessions
- **Real-time streaming**: Terminal output with gzip compression
- **Circuit breaker**: Exponential backoff with jitter to prevent reconnection storms
- **Interactive control**: Keyboard input, resize, and session management
- **OAuth login**: Browser-based Google OAuth with PKCE
- **Cross-platform**: Linux, macOS, Windows (via itmux)

## Development

```bash
git clone https://github.com/sessioncast/sessioncast-cli.git
cd sessioncast-cli
npm install
npm run build
```

## License

MIT License
