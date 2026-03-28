# 🚀 Still Alive – Decentralized CLI Communication System
## 📌 Overview

**Still Alive** is a next-generation CLI-based real-time communication system that simulates **decentralized, peer-to-peer (P2P) networking** across dynamic location zones. Inspired by modern distributed systems, it blends **TCP-based messaging**, **WebSockets**, and concepts from **mDNS (Multicast DNS)** and **WebRTC-style peer discovery** to create a lightweight yet powerful communication layer.

Designed for developers and network enthusiasts, Still Alive enables seamless, low-latency messaging while mimicking how real-world decentralized networks discover, connect, and communicate—without relying on heavy centralized infrastructure.

Perfect for exploring:

- 🌐 **Real-time networking over TCP & WebSockets**  
- 📡 **Zone-aware communication with mDNS-inspired discovery**  
- 🔗 **Peer-to-peer (P2P) connectivity models**  
- 💬 **CLI-driven distributed chat systems**  
- ⚡ **Low-latency, event-driven message exchange**  
- 🛰️ **Concepts inspired by WebRTC signaling & mesh networks**

- ## 🏗️ Tech Stack

### ⚙️ Core Technologies
- **Node.js** – Backend runtime for handling asynchronous, event-driven communication  
- **Express.js** – Lightweight server framework for handling HTTP and socket connections  

### 🔌 Real-Time Communication
- **Socket.IO** – Enables real-time, bidirectional communication over WebSockets  
- **WebSockets** – Low-latency, persistent connection for instant message exchange  

### 💻 CLI & Runtime
- **Node.js CLI (process.argv / custom scripts)** – Interactive command-line chat interface  
- **JavaScript (ES6+)** – Core programming language used across the project  

### 🌐 Networking Concepts Implemented
- **TCP/IP Model** – Underlying transport for reliable communication  
- **Zone-based Routing Logic** – Custom algorithm for grouping users by location  
- **P2P-inspired Architecture** – Simulated peer-to-peer communication within zones  
- **mDNS-inspired Discovery (Conceptual)** – Localized grouping and discovery mechanism  
- **WebRTC-inspired Signaling (Conceptual)** – Mimics decentralized connection patterns  

### 🛠️ Development Tools
- **Git & GitHub** – Version control and collaboration  
- **NPM** – Dependency management  


# 🚀 Still Alive – Decentralized CLI Communication System

> A next-gen CLI-based real-time communication platform simulating **P2P networking**, **zone-based routing**, and **decentralized connectivity** using WebSockets, TCP, and mDNS-inspired discovery.

---

---

## ✨ Features

- 💬 Real-time CLI-based chat system  
- 🌐 Zone-based communication model  
- ⚡ Low-latency messaging using WebSockets  
- 🔗 P2P-inspired architecture  
- 📡 Dynamic user grouping (zone logic)  
- 🧠 Event-driven communication system  
- 🛰️ Simulated decentralized networking  

---

## 🏗️ Tech Stack

### ⚙️ Core
- Node.js  
- Express.js  

### 🔌 Real-Time
- Socket.IO  
- WebSockets  

### 💻 CLI
- Node.js CLI (custom scripts)  
- JavaScript (ES6+)  

### 🌐 Networking Concepts
- TCP/IP Model  
- P2P Architecture (simulated)  
- mDNS-inspired discovery  
- WebRTC-inspired signaling  
- Zone-based routing  

### 🛠️ Tools
- Git & GitHub  
- NPM  

---

## 📂 Project Structure
Still_Alive/
│── backend/ # Server-side logic (Socket.IO, routing)
│── cli/ # CLI client scripts
│── utils/ # Zone logic & helper utilities
│── dashboard/ # Escuar monitoring dashboard (upcoming)
│── package.json # Dependencies and scripts
│── README.md


---

## ⚙️ Installation

```bash
# Clone the repository
git clone https://github.com/shasmithareddy/Still_Alive-.git

# Navigate into the project
cd Still_Alive-

# Install dependencies
npm install

▶️ Usage
1️⃣ Start the Server
node server.js
2️⃣ Run CLI Client
ZONE=<zone-id> node cli-chat.js <username>
✅ Example
ZONE=zone-641-4007 node cli-chat.js bobby
🧠 How It Works
Users join the network through a CLI client
Each user is assigned to a zone (manually or auto-detected in future)
Messages are broadcast within the same zone
Socket.IO ensures real-time communication
System simulates localized peer clusters (P2P-style)
📸 Example Output
═══════════════════════════════════════
  STILLALIVE CLI v2.8.1
═══════════════════════════════════════
👤 Username: bobby
🔧 Mode: server
🌐 Connected to zone: zone-641-4007
🚧 Future Improvements
🌍 Automatic Network Detection (mDNS / local network awareness)
📊 Escuar Dashboard – Real-time network visualization & monitoring
📱 Web-based UI for chat and control
🔐 Authentication & secure communication layer
🤖 AI-based smart routing & congestion handling
🌐 True P2P communication using WebRTC
📡 Cross-zone communication bridging
📊 Escuar Dashboard (Upcoming)

The Escuar Dashboard will provide:

📡 Live network visualization
👥 Active users per zone
🌐 Zone interaction mapping
⚡ Real-time message tracking
📊 Network analytics & performance metrics
🤝 Contributing

Contributions are welcome!

# Fork the repo
# Create a new branch
git checkout -b feature-name

# Commit changes
git commit -m "Added new feature"

# Push changes
git push origin feature-name
