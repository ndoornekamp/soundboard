# Soundboard

A vibecoded, dependency-free, static soundboard for personal timestamped YouTube clips.

## Run locally

The app uses browser modules, so serve the folder over HTTP instead of opening `index.html` directly:

```sh
python3 -m http.server 4173
```

Then open <http://localhost:4173>.

There is no package manager, build step, or backend. The only runtime dependency is the official YouTube IFrame Player API, loaded by the browser when the app starts.

## Validate

Run the pure JavaScript tests with Node's built-in test runner:

```sh
node --test tests/clip-model.test.mjs
node --check app.mjs
```

## Behavior

- Clip definitions are stored in local storage in the browser.
- Timestamp fields accept `m:ss`, `h:mm:ss`, or decimal seconds such as `7.5`.
- Board metadata can be exported to or imported from JSON files, pasted strings, or the clipboard.
- Imports skip clips whose IDs are already present on the board.
- YouTube playback still requires a network connection. The app intentionally uses the official embedded player and does not extract, download, or proxy YouTube audio.
- The player remains visible because playback is provided by the official YouTube embed.

## Deployment

Deploy the repository as static files on any static host. `localhost` is supported for development.

For GitHub Pages or another subpath deployment, keep the relative paths in the HTML intact.

## Raspberry Pi access

The app has no server-side account system: clips live in the browser's local storage, and the
Pi only needs to serve the static files. Keep the web server private and put the authentication
boundary in front of it. Do not port-forward port `4173` or expose Python's HTTP server directly
to the internet.

### 1. Serve the files on the Pi

Copy the repository to the Pi, then create a small systemd service. Adjust the username and path
if your Pi uses values other than `pi` and `/home/pi/soundboard`:

```ini
# /etc/systemd/system/soundboard.service
[Unit]
Description=Soundboard static server
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=pi
WorkingDirectory=/home/pi/soundboard
ExecStart=/usr/bin/python3 -m http.server 4173 --bind 127.0.0.1
Restart=on-failure
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=strict
ProtectHome=read-only

[Install]
WantedBy=multi-user.target
```

Enable it with:

```sh
sudo systemctl daemon-reload
sudo systemctl enable --now soundboard
curl http://127.0.0.1:4173
```

### 2. Reach it without port forwarding

The Pi does not need to accept a new connection from the internet. A tunnel agent on the Pi
opens an outbound, encrypted connection to a service that you can reach. Your browser connects
to that service, and the service sends the request back through the already-established tunnel
to `127.0.0.1:4173`.

#### Private access from your own devices: Tailscale

Install Tailscale on the Pi and on each device that should use the soundboard:

```sh
sudo tailscale up
sudo tailscale serve --bg http://127.0.0.1:4173
tailscale serve status
```

Open the HTTPS URL shown by `tailscale serve status`. This URL is reachable only by devices in
your Tailscale tailnet. Tailscale tries a direct encrypted connection first and uses its relay
when the two networks cannot connect directly. No router port is opened.

#### Access from an ordinary browser: Cloudflare Tunnel

Use Cloudflare Tunnel when you need a normal public hostname such as
`https://soundboard.example.com`. The `cloudflared` agent makes the outbound connection, while
Cloudflare Access requires your identity and MFA before forwarding any request to the Pi. This
requires a domain managed by Cloudflare and a Zero Trust Access application for that hostname.

In both cases, the public-facing service is the tunnel provider, not Python's HTTP server. Do not
replace the tunnel URL with the Pi's public IP, and do not add an inbound router rule for port
`4173`.

### 3. Direct access with Caddy

If you prefer a direct connection, expose a hardened reverse proxy instead of exposing Python.
This requires a domain whose DNS points to your home public IP. If your ISP uses CGNAT, normal
IPv4 port forwarding will not work; use Tailscale or Cloudflare Tunnel instead.

Install Caddy from its official package repository and create `/etc/caddy/Caddyfile`:

```caddyfile
soundboard.example.com {
	encode gzip

	basic_auth {
		soundboard REPLACE_WITH_A_CADDY_PASSWORD_HASH
	}

	reverse_proxy 127.0.0.1:4173
}
```

Generate the password hash on the Pi and put only the hash in the Caddyfile. Do not commit the
password or its hash to this repository:

```sh
caddy hash-password --plaintext 'use-a-long-unique-password'
sudo caddy validate --config /etc/caddy/Caddyfile
sudo systemctl enable --now caddy
```

Caddy obtains and renews the HTTPS certificate automatically. On the router, reserve a stable
LAN address for the Pi and forward only TCP `443` to TCP `443` on that address. Do not forward
`4173`, SSH, or any other Pi port. Use a host firewall that allows inbound `443` and allows SSH
only from your LAN, keep the Pi and Caddy updated, and disable router UPnP.

Open `https://soundboard.example.com` and sign in with the Caddy password. This still leaves the
public IP visible and the HTTPS endpoint open to scanning and denial-of-service attempts, but the
only exposed application is Caddy and the soundboard itself remains on loopback.
