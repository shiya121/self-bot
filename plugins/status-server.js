const os = require('os')
const { execSync } = require('child_process')

function formatBytes(bytes) {
    if (bytes === 0) return '0 Bytes'
    const k = 1024
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB']
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
}

function formatUptime(seconds) {
    const hrs = Math.floor(seconds / 3600)
    const mins = Math.floor((seconds % 3600) / 60)
    const secs = Math.floor(seconds % 60)
    return `${hrs} jam ${mins} menit ${secs} detik`
}

// Fungsi helper untuk baca storage internal via perintah df (Linux/Termux)
function getStorageInfo() {
    try {
        const output = execSync('df -h /data 2>/dev/null || df -h /').toString()
        const lines = output.trim().split('\n')
        if (lines.length >= 2) {
            // Ambil baris kedua (data disk)
            const parts = lines[1].replace(/\s+/g, ' ').split(' ')
            return {
                total: parts[1] || 'N/A',
                used: parts[2] || 'N/A',
                free: parts[3] || 'N/A',
                usagePercent: parts[4] || 'N/A'
            }
        }
    } catch (e) {
        // Fallback jika perintah df gagal
    }
    return { total: 'N/A', used: 'N/A', free: 'N/A', usagePercent: 'N/A' }
}

// Fungsi helper untuk baca info CPU spesifik di Termux/Linux
function getCpuInfo() {
    try {
        const cpuModel = execSync("getprop ro.product.device 2>/dev/null || uname -m").toString().trim()
        const cpuCores = os.cpus().length || 
                         parseInt(execSync("nproc 2>/dev/null || echo '0'").toString().trim())
        
        // Ambil suhu CPU jika didukung perangkat (Termux kadang butuh izin akses tertentu, jadi di-safe-kan)
        let temp = ''
        try {
            const tempRaw = execSync("cat /sys/class/thermal/thermal_zone*/temp 2>/dev/null | head -n 1").toString().trim()
            if (tempRaw) {
                temp = ` | Suhu: ${(parseInt(tempRaw) / 1000).toFixed(1)}°C`
            }
        } catch (err) {}

        return `${cpuModel} (${cpuCores} Cores)${temp}`
    } catch (e) {
        return os.cpus()[0]?.model || 'ARM Processor'
    }
}

module.exports = {
    name: 'System Status Advanced',
    command: ['.status'],
    ownerOnly: true,
    description: 'Status device',
    async execute(ctx) {
        const { sock, msg, senderJid } = ctx
        const start = Date.now()

        // Memori RAM
        const totalMem = os.totalmem()
        const freeMem = os.freemem()
        const usedMem = totalMem - freeMem
        const memPercent = ((usedMem / totalMem) * 100).toFixed(1)

        // Storage / Penyimpanan
        const storage = getStorageInfo()

        // CPU & OS
        const cpuDetail = getCpuInfo()
        const platform = os.platform()
        const arch = os.arch()
        const nodeVersion = process.version
        
        const uptimeSys = os.uptime()
        const uptimeProcess = process.uptime()
        const latency = Date.now() - start

        const statusText = `📊 *ADVANCED SYSTEM MONITOR*

🏓 *Latensi Bot:* ${latency} ms
💻 *Platform:* ${platform} (${arch}) - Node ${nodeVersion}
⚙️ *Hardware/CPU:* ${cpuDetail}

🧠 *RAM Usage (${memPercent}%):*
• Terpakai: ${formatBytes(usedMem)} / ${formatBytes(totalMem)}
• Sisa (Free): ${formatBytes(freeMem)}

💾 *Storage Internal (/data):*
• Total: ${storage.total} | Terpakai: ${storage.used} (${storage.usagePercent})
• Sisa: ${storage.free}

⏱️ *Uptime:*
• Sistem HP: ${formatUptime(uptimeSys)}
• Bot Process: ${formatUptime(uptimeProcess)}`.trim()

        await sock.sendMessage(
            senderJid,
            { text: statusText },
            { quoted: msg }
        )
    }
}
