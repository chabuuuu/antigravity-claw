# Deploying Antigravity OpenClaw on Ubuntu VPS

This guide provides step-by-step instructions for deploying **Antigravity OpenClaw** on an **Ubuntu 22.04 / 24.04 LTS** VPS for secure 24/7 remote autonomous agent operations.

---

## 1. Prerequisites

1. An Ubuntu Linux VPS (1 CPU, 1-2 GB RAM minimum, 2+ CPUs recommended).
2. Root or `sudo` access.
3. A domain name pointed to your VPS IP (e.g., `openclaw.yourdomain.com`).
4. Google Antigravity CLI (`agy`) installed and authenticated on the VPS.

---

## 2. Installing Google Antigravity CLI on VPS

If you haven't installed Antigravity on your VPS yet:

```bash
# Verify curl and python
sudo apt update && sudo apt install -y curl python3 python3-pip

# Install Antigravity CLI according to official guidelines
# (Or ensure ~/.gemini/bin/agy exists and is in your PATH)
mkdir -p ~/.gemini/bin
echo 'export PATH="$HOME/.gemini/bin:$PATH"' >> ~/.bashrc
source ~/.bashrc

# Test agy
agy --help
```

---

## 3. Cloning and Installing OpenClaw

```bash
# Clone the repository
git clone https://github.com/<your-username>/antigravity-openclaw.git
cd antigravity-openclaw

# Run the automated installer
chmod +x install.sh
./install.sh
```

The installer will:
- Install Python virtual environment & packages (`tornado`, `bcrypt`, `pyjwt`, `psutil`, `requests`).
- Verify the `agy` binary location.
- Configure `.env` with sensible defaults.
- Create systemd service `antigravity-openclaw.service`.

---

## 4. Configuring Firewall (UFW)

Protect your VPS by only exposing SSH, HTTP, and HTTPS:

```bash
sudo ufw allow 22/tcp    # SSH
sudo ufw allow 80/tcp    # HTTP (for Certbot SSL issuance)
sudo ufw allow 443/tcp   # HTTPS (Production OpenClaw)
sudo ufw enable
```

---

## 5. Setting up Nginx Reverse Proxy & SSL (HTTPS)

### Step 5.1: Install Nginx and Certbot
```bash
sudo apt install -y nginx certbot python3-certbot-nginx
```

### Step 5.2: Configure Nginx Site
Copy the provided Nginx template:
```bash
sudo cp nginx.conf.example /etc/nginx/sites-available/openclaw.conf
```

Edit `/etc/nginx/sites-available/openclaw.conf` and replace `your-domain.com` with your actual domain:
```bash
sudo nano /etc/nginx/sites-available/openclaw.conf
```

Enable the site configuration:
```bash
sudo ln -s /etc/nginx/sites-available/openclaw.conf /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx
```

### Step 5.3: Obtain Free Let's Encrypt SSL Certificate
```bash
sudo certbot --nginx -d your-domain.com
```
Certbot will automatically verify your domain, configure the SSL certificates, and set up auto-renewal.

---

## 6. Managing the Background Service

Antigravity OpenClaw runs as a systemd service:

```bash
# Start service
sudo systemctl start antigravity-openclaw

# Check status
sudo systemctl status antigravity-openclaw

# Restart service
sudo systemctl restart antigravity-openclaw

# View live application logs
journalctl -u antigravity-openclaw -f
```

---

## 7. First Access & Master Administrator Setup

1. Open your browser and navigate to:
   ```
   https://your-domain.com
   ```
2. Because no users exist in the new database, OpenClaw will automatically display the **Master Administrator Setup Wizard**.
3. Choose a strong master username and password (at least 8 characters).
4. Click **Create Administrator**.
5. Once submitted, your credentials are saved, your signed session token is issued, and you gain access to your remote Antigravity studio!

