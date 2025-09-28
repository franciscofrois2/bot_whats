const { Client, LocalAuth, MessageMedia } = require("whatsapp-web.js");
const qrcode = require("qrcode-terminal");
const ExcelJS = require("exceljs"); // Alterado de XLSX para ExcelJS
const fs = require("fs");
const path = require("path");

// ========== CONFIGURAÇÕES DO BOT ==========
const BOT_CONFIG = {
    MENTION_ALL_COMMAND: "@",
    MENTION_ALL_VISIBLE_COMMAND: "todosvisiveis",
    HELP_COMMAND: "ajuda",
    STATS_COMMAND: "estatisticas",
    COMMAND_PREFIX: "!",
    MESSAGE_DELAY: 3000,
    RATE_LIMIT_DURATION: 30,
    ADMINS: [
        "559870275434",
        "559891506740"],
    RECONNECT_ATTEMPTS: 5,
    RECONNECT_DELAY: 5000,
    ADDITIONAL_READY_TIME: 10000
};

// ========== CONFIGURAÇÕES DO SISTEMA DE ROTAS ==========
const ROTAS_CONFIG = {
    DATA_FILE_PATH: path.join(__dirname, 'data', 'planilha rotas test bot.xlsx'),
    BACKUP_PATH: path.join(__dirname, 'backups')
};

// ========== CLASSE ROTASMANAGER (ADAPTADA PARA EXCELJS) ==========
class RotasManager {
    constructor() {
        this.filePath = ROTAS_CONFIG.DATA_FILE_PATH;
        this.backupPath = ROTAS_CONFIG.BACKUP_PATH;
        this.ensureDirectories();
        this.rotas = [];
        this.headers = [];
        // A chamada agora é assíncrona, mas o construtor não pode ser async.
        // A carga inicial será feita em segundo plano e aguardada no client.on('ready').
        this.carregarPlanilha(); 
    }

    ensureDirectories() {
        if (!fs.existsSync(path.dirname(this.filePath))) {
            fs.mkdirSync(path.dirname(this.filePath), { recursive: true });
        }
        if (!fs.existsSync(this.backupPath)) {
            fs.mkdirSync(this.backupPath, { recursive: true });
        }
    }

    criarBackup() {
        try {
            if (!fs.existsSync(this.filePath)) return true;
            
            const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
            const backupFile = path.join(this.backupPath, `backup_${timestamp}.xlsx`);
            fs.copyFileSync(this.filePath, backupFile);
            console.log(`Backup criado: ${backupFile}`);
            return true;
        } catch (error) {
            console.error('Erro ao criar backup:', error);
            return false;
        }
    }

    async carregarPlanilha() {
        try {
            if (!fs.existsSync(this.filePath)) {
                console.error('Arquivo da planilha não encontrado:', this.filePath);
                this.rotas = [];
                this.headers = [];
                return;
            }

            const workbook = new ExcelJS.Workbook();
            await workbook.xlsx.readFile(this.filePath);
            const worksheet = workbook.getWorksheet(1); // Pega a primeira planilha

            let headerRowIndex = -1;

            // Encontrar a linha de cabeçalhos dinamicamente
            worksheet.eachRow((row, rowNumber) => {
                const rowValues = row.values.map(v => (v ? v.toString() : ''));
                if (rowValues.includes('N° ROTA') || rowValues.includes('NUMERO')) {
                    if (headerRowIndex === -1) { // Pega a primeira ocorrência
                        headerRowIndex = rowNumber;
                        this.headers = row.values.slice(1).map(header => header ? header.trim() : header); // O slice(1) remove o valor nulo inicial que o exceljs adiciona

                    }
                }
            });

            if (headerRowIndex === -1) {
                console.error("Cabeçalho 'N° ROTA' ou 'NUMERO' não encontrado na planilha.");
                this.rotas = [];
                return;
            }

            this.rotas = [];
            worksheet.eachRow((row, rowNumber) => {
                if (rowNumber > headerRowIndex) {
                    const rowValues = row.values.slice(1);
                    const obj = {};
                    let hasNumeroRota = false;
                    this.headers.forEach((header, i) => {
                        obj[header] = rowValues[i] || '';
                        if ((header === 'N° ROTA' || header === 'NUMERO') && obj[header].toString().trim() !== '') {
                            hasNumeroRota = true;
                        }
                    });
                    if (hasNumeroRota) {
                        this.rotas.push(obj);
                    }
                }
            });

            console.log(`Planilha carregada com ${this.rotas.length} rotas usando exceljs`);
        } catch (error) {
            console.error('Erro ao carregar planilha com exceljs:', error);
            this.rotas = [];
            this.headers = [];
        }
    }

    async salvarPlanilha() {
        try {
            this.criarBackup();

            const workbook = new ExcelJS.Workbook();
            const worksheet = workbook.addWorksheet('Rotas');

            // Adicionando cabeçalhos fixos (se necessário, pode ser adaptado para ser dinâmico)
            worksheet.addRow(['NUMERO', '', 'ROTAS ESCOLARES - ATUALIZADO 01/07/25', '', '', 'ROTA - MONITORES', 'EMPRESAS DE ÔNIBUS', '', '', '', 'DATA DE INÍCIO']);
            worksheet.addRow(['ÔNIBUS', 'N° ROTA', 'ROTA', 'ESCOLAS ATENDIDAS', 'TURNO QUE O ÔNIBUS ATENDE', 'MONITOR', 'MOTORISTAS / CONTATO', 'EMPRESA', 'KM', 'PLACAS - ÔNIBUS', '']);
            worksheet.addRow(this.headers);

            // Adicionando os dados das rotas
            const dataToSave = this.rotas.map(rota => {
                return this.headers.map(header => rota[header] || '');
            });
            worksheet.addRows(dataToSave);

            await workbook.xlsx.writeFile(this.filePath);
            console.log('Planilha salva com sucesso com exceljs!');
            return true;
        } catch (error) {
            console.error('Erro ao salvar planilha com exceljs:', error);
            return false;
        }
    }

    buscarPorRota(numeroRota) {
        return this.rotas.find(r => 
            r['N° ROTA'] && r['N° ROTA'].toString().toUpperCase() === numeroRota.toUpperCase()
        );
    }

    buscarPorMotorista(nomeMotorista) {
        const nomeBusca = nomeMotorista.toUpperCase();
        return this.rotas.filter(r => 
            r['MOTORISTAS / CONTATO'] && 
            r['MOTORISTAS / CONTATO'].toString().toUpperCase().includes(nomeBusca)
        );
    }

    buscarPorMonitor(nomeMonitor) {
        const nomeBusca = nomeMonitor.toUpperCase();
        return this.rotas.filter(r => 
            r['MONITOR'] && 
            r['MONITOR'].toString().toUpperCase().includes(nomeBusca)
        );
    }

    buscarPorEmpresa(nomeEmpresa) {
        const nomeBusca = nomeEmpresa.toUpperCase();
        return this.rotas.filter(r => 
            r['EMPRESA'] && 
            r['EMPRESA'].toString().toUpperCase().includes(nomeBusca)
        );
    }

    async adicionarRota(novaRota) {
        try {
            const rotaExistente = this.rotas.find(r => 
                r['N° ROTA'] && r['N° ROTA'].toString() === novaRota['N° ROTA'].toString()
            );
            
            if (rotaExistente) {
                return { success: false, message: 'Já existe uma rota com este número' };
            }
            
            this.rotas.push(novaRota);
            const salvou = await this.salvarPlanilha(); // Agora com await
            
            if (salvou) {
                return { success: true, message: 'Rota adicionada com sucesso!' };
            } else {
                // Se falhou, remove a rota que foi adicionada na memória
                this.rotas.pop();
                return { success: false, message: 'Erro ao salvar a planilha' };
            }
        } catch (error) {
            return { success: false, message: `Erro: ${error.message}` };
        }
    }

    async atualizarRota(numeroRota, camposAtualizados) {
        try {
            const index = this.rotas.findIndex(r => 
                r['N° ROTA'] && r['N° ROTA'].toString() === numeroRota.toString()
            );
            
            if (index === -1) {
                return { success: false, message: 'Rota não encontrada' };
            }
            
            // Salva o estado original para o caso de falha ao salvar
            const rotaOriginal = { ...this.rotas[index] };

            Object.keys(camposAtualizados).forEach(campo => {
                if (this.headers.includes(campo)) {
                    this.rotas[index][campo] = camposAtualizados[campo];
                }
            });
            
            const salvou = await this.salvarPlanilha(); // Agora com await
            
            if (salvou) {
                return { success: true, message: 'Rota atualizada com sucesso!' };
            } else {
                // Restaura a rota original se o salvamento falhar
                this.rotas[index] = rotaOriginal;
                return { success: false, message: 'Erro ao salvar a planilha' };
            }
        } catch (error) {
            return { success: false, message: `Erro: ${error.message}` };
        }
    }

    formatarRespostaRota(rota) {
        if (!rota) return "Rota não encontrada!";
        
        let resposta = `*${rota['N° ROTA']} - ${rota['ROTA']}*\n\n`;
        resposta += `• Ônibus: ${rota['ÔNIBUS'] || 'N/A'}\n`;
        resposta += `• Escolas: ${rota['ESCOLAS ATENDIDAS'] || 'N/A'}\n`;
        resposta += `• Turno: ${rota['TURNO QUE O ÔNIBUS ATENDE'] || 'N/A'}\n`;
        resposta += `• Monitor: ${rota['MONITOR'] || 'N/A'}\n`;
        resposta += `• Motorista: ${rota['MOTORISTAS / CONTATO'] || 'N/A'}\n`;
        resposta += `• Empresa: ${rota['EMPRESA'] || 'N/A'}\n`;
        resposta += `• KM: ${rota['KM'] || 'N/A'}\n`;
        resposta += `• Placa: ${rota['PLACAS - ÔNIBUS'] || 'N/A'}\n`;
        
        if (rota['DATA DE INÍCIO']) {
            resposta += `• Início: ${rota['DATA DE INÍCIO']}`;
        }
        
        return resposta;
    }

    listarTodasRotas() {
        if (this.rotas.length === 0) {
            return "Nenhuma rota encontrada ou a planilha ainda está sendo carregada. Tente novamente em alguns segundos.";
        }
        
        let resposta = "*Todas as Rotas:*\n\n";
        this.rotas.forEach(rota => {
            resposta += `• ${rota['N° ROTA']} - ${rota['ROTA']}\n`;
        });
        
        return resposta;
    }
}

// ========== INICIALIZAÇÃO DO BOT ==========
const client = new Client({
    authStrategy: new LocalAuth({
        clientId: "whatsapp-bot-mention-all"
    }),
    puppeteer: {
        headless: true,
        args: [
            "--no-sandbox",
            "--disable-setuid-sandbox",
            "--disable-dev-shm-usage",
            "--disable-accelerated-2d-canvas",
            "--no-first-run",
            "--no-zygote",
            "--single-process",
            "--disable-gpu"
        ]
    }
});

// ========== VARIÁVEIS GLOBAIS ==========
let isClientFullyReady = false;
let readyTimestamp = 0;
const rateLimitMap = new Map();
const commandStats = {
    totalCommands: 0,
    commandsByType: new Map(),
    users: new Map()
};
const rotasManager = new RotasManager();

// ========== FUNÇÕES UTILITÁRIAS ==========
function isAdmin(userId) {
    const phoneNumber = userId.replace("@c.us", "");
    return BOT_CONFIG.ADMINS.includes(phoneNumber);
}

function checkRateLimit(userId, command) {
    const now = Date.now();
    const userKey = `${userId}-${command}`;
    
    if (!rateLimitMap.has(userKey)) {
        rateLimitMap.set(userKey, now);
        return true;
    }
    
    const lastTime = rateLimitMap.get(userKey);
    const timeDiff = (now - lastTime) / 1000;
    
    if (timeDiff < BOT_CONFIG.RATE_LIMIT_DURATION) {
        return false;
    }
    
    rateLimitMap.set(userKey, now);
    return true;
}

function updateStats(userId, command, userName = "Unknown") {
    commandStats.totalCommands++;
    
    if (!commandStats.commandsByType.has(command)) {
        commandStats.commandsByType.set(command, 0);
    }
    commandStats.commandsByType.set(command, commandStats.commandsByType.get(command) + 1);
    
    if (!commandStats.users.has(userId)) {
        commandStats.users.set(userId, {
            count: 0,
            name: userName,
            lastCommand: null,
            lastCommandTime: null
        });
    }
    
    const userData = commandStats.users.get(userId);
    userData.count++;
    userData.lastCommand = command;
    userData.lastCommandTime = new Date().toISOString();
}

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

function normalizeCommand(text) {
    if (!text.startsWith(BOT_CONFIG.COMMAND_PREFIX)) return null;
    
    return text.substring(BOT_CONFIG.COMMAND_PREFIX.length)
               .trim()
               .toLowerCase();
}

async function checkClientReady() {
    if (isClientFullyReady) return true;
    
    if (readyTimestamp > 0) {
        const timeSinceReady = Date.now() - readyTimestamp;
        if (timeSinceReady < BOT_CONFIG.ADDITIONAL_READY_TIME) {
            console.log(`⏳ Cliente ainda não está totalmente pronto. Aguardando... (${Math.ceil((BOT_CONFIG.ADDITIONAL_READY_TIME - timeSinceReady) / 1000)}s restantes)`);
            await sleep(1000);
            return checkClientReady();
        }
    }
    
    return isClientFullyReady;
}

// ========== FUNÇÕES DE COMANDOS DE MENCIONAR ==========
async function mentionAllInvisible(chat, message, userId) {
    try {
        console.log(`🔄 Iniciando menção invisível solicitada por ${userId}`);
        
        if (!chat.isGroup) {
            await message.reply("❌ Este comando só funciona em grupos!");
            return false;
        }

        if (!isAdmin(userId)) {
            await message.reply("❌ Apenas administradores podem usar este comando!");
            return false;
        }

        const participants = chat.participants;
        console.log(`🔍 Encontrados ${participants.length} participantes no grupo.`);
        
        if (participants.length === 0) {
            await message.reply("❌ Não foi possível obter a lista de participantes ou o grupo está vazio.");
            return false;
        }

        const mentions = participants.map(participant => participant.id._serialized);
        await chat.sendMessage("", { mentions: mentions });

        console.log(`✅ Menção invisível enviada para ${participants.length} membros.`);
        return true;
        
    } catch (error) {
        console.error("❌ Erro ao mencionar todos (invisível):", error);
        return false;
    }
}

async function mentionAllVisible(chat, message, userId) {
    try {
        console.log(`🔄 Iniciando menção visível solicitada por ${userId}`);
        
        if (!chat.isGroup) {
            await message.reply("❌ Este comando só funciona em grupos!");
            return false;
        }

        if (!isAdmin(userId)) {
            await message.reply("❌ Apenas administradores podem usar este comando!");
            return false;
        }

        const participants = chat.participants;
        console.log(`🔍 Encontrados ${participants.length} participantes no grupo.`);
        
        if (participants.length === 0) {
            await message.reply("❌ Não foi possível obter a lista de participantes ou o grupo está vazio.");
            return false;
        }

        let messageText = "📢 *Atenção pessoal!*\n\n";
        const mentions = [];

        for (let participant of participants) {
            const phoneNumber = participant.id.user;
            mentions.push(participant.id._serialized);
            messageText += `@${phoneNumber} `;
        }

        messageText += "\n\n_Todos os membros foram mencionados._";

        await chat.sendMessage(messageText, { mentions: mentions });

        console.log(`✅ Menção visível enviada para ${participants.length} membros.`);
        await message.reply(`✅ Menção visível enviada para ${participants.length} membros do grupo!`);
        return true;
        
    } catch (error) {
        console.error("❌ Erro ao mencionar todos (visível):", error);
        await message.reply("❌ Erro ao executar o comando de menção visível. Tente novamente.");
        return false;
    }
}

// ========== FUNÇÕES DE COMANDOS DE ROTAS ==========
async function processRotasCommand(message) {
    const text = message.body.toLowerCase();
    const from = message.from;

    // Comando de ajuda para rotas
    if (text === '!rotas ajuda') {
        const ajuda = `
*Sistema de Gerenciamento de Rotas Escolares*

*Comandos de consulta:*
!rotas - Lista todas as rotas
!rota [número] - Informações de uma rota específica
!motorista [nome] - Rotas de um motorista
!monitor [nome] - Rotas de um monitor
!empresa [nome] - Rotas de uma empresa

*Comandos administrativos:*
!addrota [dados] - Adicionar nova rota
!updrota [dados] - Atualizar rota existente

*Formato para adicionar/atualizar:*
NROTA|ONIBUS|ROTA|ESCOLAS|TURNO|MONITOR|MOTORISTA|EMPRESA|KM|PLACA|DATA
        `;
        return message.reply(ajuda);
    }

    // Listar todas as rotas
    if (text === '!rotas') {
        const resposta = rotasManager.listarTodasRotas();
        return message.reply(resposta);
    }

    // Consultar rota específica
    if (text.startsWith('!rota ')) {
        const numeroRota = text.split(' ')[1];
        const rota = rotasManager.buscarPorRota(numeroRota);
        const resposta = rotasManager.formatarRespostaRota(rota);
        return message.reply(resposta);
    }

    // Consultar por motorista
    if (text.startsWith('!motorista ')) {
        const nomeMotorista = text.split(' ').slice(1).join(' ');
        const rotas = rotasManager.buscarPorMotorista(nomeMotorista);
        
        if (rotas.length === 0) {
            return message.reply('Nenhuma rota encontrada para este motorista.');
        }
        
        let resposta = `*Rotas do motorista ${nomeMotorista}:*\n\n`;
        rotas.forEach(rota => {
            resposta += `• ${rota['N° ROTA']} - ${rota['ROTA']}\n`;
        });
        return message.reply(resposta);
    }

    // Consultar por monitor
    if (text.startsWith('!monitor ')) {
        const nomeMonitor = text.split(' ').slice(1).join(' ');
        const rotas = rotasManager.buscarPorMonitor(nomeMonitor);
        
        if (rotas.length === 0) {
            return message.reply('Nenhuma rota encontrada para este monitor.');
        }
        
        let resposta = `*Rotas do monitor ${nomeMonitor}:*\n\n`;
        rotas.forEach(rota => {
            resposta += `• ${rota['N° ROTA']} - ${rota['ROTA']}\n`;
        });
        return message.reply(resposta);
    }

    // Consultar por empresa
    if (text.startsWith('!empresa ')) {
        const nomeEmpresa = text.split(' ').slice(1).join(' ');
        const rotas = rotasManager.buscarPorEmpresa(nomeEmpresa);
        
        if (rotas.length === 0) {
            return message.reply('Nenhuma rota encontrada para esta empresa.');
        }
        
        let resposta = `*Rotas da empresa ${nomeEmpresa}:*\n\n`;
        rotas.forEach(rota => {
            resposta += `• ${rota['N° ROTA']} - ${rota['ROTA']}\n`;
        });
        return message.reply(resposta);
    }

    // Adicionar rota (apenas administradores)
    if (text.startsWith('!addrota ')) {
        if (!isAdmin(from)) {
            return message.reply('Você não tem permissão para executar este comando.');
        }
        
        try {
            const dados = text.replace('!addrota ', '').split('|');
            
            if (dados.length < 11) {
                return message.reply('Formato incorreto. Use: NROTA|ONIBUS|ROTA|ESCOLAS|TURNO|MONITOR|MOTORISTA|EMPRESA|KM|PLACA|DATA');
            }
            
            const novaRota = {
                'ÔNIBUS': dados[0],
                'N° ROTA': dados[1],
                'ROTA': dados[2],
                'ESCOLAS ATENDIDAS': dados[3],
                'TURNO QUE O ÔNIBUS ATENDE': dados[4],
                'MONITOR': dados[5],
                'MOTORISTAS / CONTATO': dados[6],
                'EMPRESA': dados[7],
                'KM': dados[8],
                'PLACAS - ÔNIBUS': dados[9],
                'DATA DE INÍCIO': dados[10]
            };
            
            const resultado = await rotasManager.adicionarRota(novaRota); // Adicionado await
            return message.reply(resultado.message);
            
        } catch (error) {
            return message.reply('Erro ao processar o comando. Verifique o formato.');
        }
    }

    // Atualizar rota (apenas administradores)
    if (text.startsWith('!updrota ')) {
        if (!isAdmin(from)) {
            return message.reply('Você não tem permissão para executar este comando.');
        }
        
        try {
            const dados = text.replace('!updrota ', '').split('|');
            
            if (dados.length < 3) {
                return message.reply('Formato incorreto. Use: NROTA|CAMPO|VALOR');
            }
            
            const numeroRota = dados[0];
            const campo = dados[1];
            const valor = dados.slice(2).join('|');
            
            const camposValidos = ['ÔNIBUS', 'ROTA', 'ESCOLAS ATENDIDAS', 'TURNO QUE O ÔNIBUS ATENDE', 
                                  'MONITOR', 'MOTORISTAS / CONTATO', 'EMPRESA', 'KM', 'PLACAS - ÔNIBUS', 'DATA DE INÍCIO'];
            
            if (!camposValidos.includes(campo)) {
                return message.reply(`Campo inválido. Campos válidos: ${camposValidos.join(', ')}`);
            }
            
            const camposAtualizados = { [campo]: valor };
            const resultado = await rotasManager.atualizarRota(numeroRota, camposAtualizados); // Adicionado await
            return message.reply(resultado.message);
            
        } catch (error) {
            return message.reply('Erro ao processar o comando. Verifique o formato.');
        }
    }

    return null;
}

// ========== FUNÇÕES DE COMANDOS EXISTENTES ==========
async function showHelp(message, userId) {
    console.log(`ℹ️ Exibindo mensagem de ajuda para ${userId}`);
    
    const isUserAdmin = isAdmin(userId);
    let helpText = `🤖 *Bot WhatsApp - Comandos Disponíveis*\n\n📋 *Comandos Principais:*\n• \`${BOT_CONFIG.COMMAND_PREFIX}${BOT_CONFIG.HELP_COMMAND}\` - Mostra esta ajuda\n• \`${BOT_CONFIG.COMMAND_PREFIX}${BOT_CONFIG.STATS_COMMAND}\` - Mostra estatísticas de uso`;
    
    if (isUserAdmin) {
        helpText += `\n• \`${BOT_CONFIG.COMMAND_PREFIX}${BOT_CONFIG.MENTION_ALL_COMMAND}\` - Menciona todos (invisível)\n• \`${BOT_CONFIG.COMMAND_PREFIX}${BOT_CONFIG.MENTION_ALL_VISIBLE_COMMAND}\` - Menciona todos (visível)`;
    }
    
    helpText += `\n\n📚 *Comandos de Rotas:*\n• \`!rotas ajuda\` - Ajuda do sistema de rotas\n• \`!rotas\` - Lista todas as rotas\n• \`!rota [número]\` - Informações de uma rota\n• \`!motorista [nome]\` - Rotas de um motorista\n• \`!monitor [nome]\` - Rotas de um monitor\n• \`!empresa [nome]\` - Rotas de uma empresa`;
    
    if (isUserAdmin) {
        helpText += `\n• \`!addrota [dados]\` - Adicionar nova rota\n• \`!updrota [dados]\` - Atualizar rota existente`;
    }
    
    helpText += `\n\nℹ️ *Informações:*\n• Comandos funcionam apenas em grupos\n• Rate limiting: 1 comando a cada ${BOT_CONFIG.RATE_LIMIT_DURATION} segundos por usuário`;
    
    if (isUserAdmin) {
        helpText += `\n• Você é um administrador e tem acesso a comandos especiais`;
    }
    
    helpText += `\n\n⚠️ *Aviso:*\nEste bot usa métodos não oficiais do WhatsApp. Use por sua conta e risco.\n\n🔧 *Status:* Online e funcionando`;

    await message.reply(helpText);
    console.log("✅ Mensagem de ajuda enviada.");
}

async function showStats(message, userId) {
    console.log(`ℹ️ Exibindo estatísticas para ${userId}`);
    
    if (!isAdmin(userId)) {
        await message.reply("❌ Apenas administradores podem ver as estatísticas!");
        return;
    }
    
    let statsText = `📊 *Estatísticas do Bot*\n\n`;
    statsText += `• Total de comandos executados: ${commandStats.totalCommands}\n\n`;
    
    statsText += `📋 *Comandos por tipo:*\n`;
    for (let [cmd, count] of commandStats.commandsByType) {
        statsText += `• ${BOT_CONFIG.COMMAND_PREFIX}${cmd}: ${count} vez(es)\n`;
    }
    
    statsText += `\n👥 *Últimos usuários (top 5):*\n`;
    const usersArray = Array.from(commandStats.users.entries())
        .sort((a, b) => b[1].count - a[1].count)
        .slice(0, 5);
    
    for (let [userId, data] of usersArray) {
        const shortId = userId.replace('@c.us', '');
        statsText += `• ${data.name || shortId}: ${data.count} comando(s)\n`;
    }
    
    await message.reply(statsText);
    console.log("✅ Estatísticas enviadas.");
}

async function processCommand(message) {
    const chat = await message.getChat();
    const sender = await message.getContact();
    const normalizedCmd = normalizeCommand(message.body);
    
    if (!normalizedCmd) return;
    
    console.log(`📨 Comando recebido: "${normalizedCmd}" de ${sender.pushname || sender.number} (${sender.id._serialized}) em ${chat.isGroup ? "grupo" : "chat privado"}.`);

    const isReady = await checkClientReady();
    if (!isReady) {
        console.error("❌ Cliente não está pronto após múltiplas tentativas. Não é possível processar comandos.");
        await message.reply("❌ O bot ainda não está totalmente pronto. Aguarde alguns segundos e tente novamente.");
        return;
    }

    if (!checkRateLimit(sender.id._serialized, normalizedCmd)) {
        const timeLeft = BOT_CONFIG.RATE_LIMIT_DURATION - Math.floor((Date.now() - rateLimitMap.get(`${sender.id._serialized}-${normalizedCmd}`)) / 1000);
        await message.reply(`⏳ Aguarde ${timeLeft} segundos antes de usar este comando novamente.`);
        console.log(`⏳ Rate limit atingido para ${sender.id._serialized} com comando ${normalizedCmd}`);
        return;
    }

    await sleep(BOT_CONFIG.MESSAGE_DELAY);
    updateStats(sender.id._serialized, normalizedCmd, sender.pushname || sender.number);

    switch (normalizedCmd) {
        case BOT_CONFIG.MENTION_ALL_COMMAND:
            await mentionAllInvisible(chat, message, sender.id._serialized);
            break;
            
        case BOT_CONFIG.MENTION_ALL_VISIBLE_COMMAND:
            await mentionAllVisible(chat, message, sender.id._serialized);
            break;
            
        case BOT_CONFIG.HELP_COMMAND:
            await showHelp(message, sender.id._serialized);
            break;
            
        case BOT_CONFIG.STATS_COMMAND:
            await showStats(message, sender.id._serialized);
            break;
            
        default:
            console.log(`❓ Comando não reconhecido: ${normalizedCmd}.`);
            await message.reply(`❓ Comando não reconhecido. Use ${BOT_CONFIG.COMMAND_PREFIX}${BOT_CONFIG.HELP_COMMAND} para ver os comandos disponíveis.`);
            break;
    }
}

async function processAutoResponse(message) {
    const messageText = message.body.toLowerCase().trim();
    const chat = await message.getChat();
    const sender = await message.getContact();
    
    console.log(`💬 Mensagem privada recebida: "${messageText}" de ${sender.pushname || sender.number}.`);

    const isReady = await checkClientReady();
    if (!isReady) {
        console.error("❌ Cliente não está pronto após múltiplas tentativas. Não é possível processar respostas automáticas.");
        return;
    }

    if (messageText.includes("oi") || messageText.includes("olá") || messageText.includes("ola")) {
        await message.reply(`Olá ${sender.pushname || "amigo"}! 👋\n\nEu sou um bot para WhatsApp. Digite *${BOT_CONFIG.COMMAND_PREFIX}${BOT_CONFIG.HELP_COMMAND}* para ver os comandos disponíveis.`);
        console.log("✅ Resposta automática de saudação enviada.");
    }
    else if (messageText.includes("ajuda") || messageText.includes("help")) {
        await showHelp(message, sender.id._serialized);
    }
    else if (messageText.includes("como usar") || messageText.includes("como funciona")) {
        await message.reply(`🤖 *Como usar o bot:*\n\n1. Adicione o bot a um grupo\n2. Digite *${BOT_CONFIG.COMMAND_PREFIX}${BOT_CONFIG.HELP_COMMAND}* para ver os comandos disponíveis\n\n⚠️ *Importante:* Alguns comandos funcionam apenas em grupos e exigem permissões de administrador!`);
        console.log("✅ Resposta automática de como usar enviada.");
    }
}

async function attemptReconnection(attempt = 1) {
    if (attempt > BOT_CONFIG.RECONNECT_ATTEMPTS) {
        console.error(`❌ Não foi possível reconectar após ${BOT_CONFIG.RECONNECT_ATTEMPTS} tentativas.`);
        return;
    }
    
    console.log(`🔌 Tentativa de reconexão ${attempt} de ${BOT_CONFIG.RECONNECT_ATTEMPTS}...`);
    
    try {
        isClientFullyReady = false;
        readyTimestamp = 0;
        
        await client.initialize();
        console.log("✅ Reconexão bem-sucedida!");
    } catch (error) {
        console.error(`❌ Falha na tentativa de reconexão ${attempt}:`, error);
        await sleep(BOT_CONFIG.RECONNECT_DELAY);
        await attemptReconnection(attempt + 1);
    }
}

// ========== EVENT LISTENERS ==========
client.on("qr", (qr) => {
    console.log("📱 QR Code recebido. Escaneie com seu WhatsApp:");
    qrcode.generate(qr, { small: true });
    console.log("\n🔗 Ou acesse: https://web.whatsapp.com e escaneie o QR code acima");
});

client.on("ready", async () => { // Adicionado 'async' aqui
    console.log("✅ Bot WhatsApp conectado e pronto!");
    console.log("📋 Comandos disponíveis:");
    console.log(`   • ${BOT_CONFIG.COMMAND_PREFIX}${BOT_CONFIG.HELP_COMMAND} - Mostrar ajuda`);
    console.log(`   • ${BOT_CONFIG.COMMAND_PREFIX}${BOT_CONFIG.STATS_COMMAND} - Mostrar estatísticas (admin)`);
    console.log(`   • ${BOT_CONFIG.COMMAND_PREFIX}${BOT_CONFIG.MENTION_ALL_COMMAND} - Mencionar todos (invisível, admin)`);
    console.log(`   • ${BOT_CONFIG.COMMAND_PREFIX}${BOT_CONFIG.MENTION_ALL_VISIBLE_COMMAND} - Mencionar todos (visível, admin)`);
    console.log("   • !rotas ajuda - Ajuda do sistema de rotas");
    console.log("   • !rotas - Listar todas as rotas");
    console.log("   • !rota [número] - Informações de uma rota");
    console.log("   • !motorista [nome] - Rotas de um motorista");
    console.log("   • !monitor [nome] - Rotas de um monitor");
    console.log("   • !empresa [nome] - Rotas de uma empresa");
    console.log("   • !addrota [dados] - Adicionar rota (admin)");
    console.log("   • !updrota [dados] - Atualizar rota (admin)");
    console.log("\n🚀 Bot funcionando...");
    
    readyTimestamp = Date.now();
    
    // Aguarda o carregamento da planilha antes de declarar o bot totalmente pronto
    await rotasManager.carregarPlanilha(); 

    setTimeout(() => {
        isClientFullyReady = true;
        console.log("✅✅ Cliente totalmente pronto para processar comandos!");
    }, BOT_CONFIG.ADDITIONAL_READY_TIME);
});

client.on("authenticated", () => {
    console.log("🔐 Autenticação realizada com sucesso!");
});

client.on("auth_failure", (msg) => {
    console.error("❌ Falha na autenticação:", msg);
});

client.on("disconnected", async (reason) => {
    console.log("🔌 Cliente desconectado:", reason);
    console.log("🔄 Tentando reconectar...");
    await attemptReconnection();
});

client.on("message", async (message) => {
    if (!isClientFullyReady) {
        console.log("⏳ Mensagem recebida, mas cliente não está totalmente pronto. Aguardando...");
        return;
    }
    
    console.log("--- Início do processamento da mensagem ---");
    console.log(`[Mensagem Recebida] ID: ${message.id.id}, De: ${message.from}, Para: ${message.to}, Tipo: ${message.type}`);
    console.log(`[Mensagem Conteúdo] Corpo: "${message.body}"`);

    try {
        if (message.fromMe) {
            console.log("[Mensagem Ignorada] Mensagem do próprio bot.");
            return;
        }
        
        if (message.from === "status@broadcast") {
            console.log("[Mensagem Ignorada] Mensagem de status.");
            return;
        }
        
        const messageText = message.body.trim();
        const chat = await message.getChat();
        const sender = await message.getContact();

        console.log(`[Contexto Mensagem] Chat é grupo: ${chat.isGroup}, Remetente: ${sender.pushname || sender.number}`);
        
        // Primeiro, verificar se é um comando de rotas
        if (messageText.startsWith('!') && (messageText.startsWith('!rotas') || messageText.startsWith('!rota') || 
            messageText.startsWith('!motorista') || messageText.startsWith('!monitor') || 
            messageText.startsWith('!empresa') || messageText.startsWith('!addrota') || 
            messageText.startsWith('!updrota'))) {
            
            console.log(`[Processamento] Mensagem identificada como comando de rotas: "${messageText}".`);
            await processRotasCommand(message);
            return;
        }
        
        // Depois, verificar se é um comando normal
        if (messageText.startsWith(BOT_CONFIG.COMMAND_PREFIX)) {
            console.log(`[Processamento] Mensagem identificada como comando normal: "${messageText}".`);
            await processCommand(message);
        } else {
            console.log(`[Processamento] Mensagem identificada como texto normal: "${messageText}".`);
            if (!chat.isGroup) {
                console.log("[Processamento] Enviando para processamento de resposta automática (chat privado).");
                await processAutoResponse(message);
            } else {
                console.log("[Processamento] Mensagem normal em grupo. Ignorando resposta automática.");
            }
        }
        
    } catch (error) {
        console.error("❌ Erro ao processar mensagem:", error);
    }
    console.log("--- Fim do processamento da mensagem ---");
});

// ========== TRATAMENTO DE ERROS ==========
process.on("unhandledRejection", (reason, promise) => {
    console.error("❌ Unhandled Rejection at:", promise, "reason:", reason);
});

process.on("uncaughtException", (error) => {
    console.error("❌ Uncaught Exception:", error);
    attemptReconnection();
});

// ========== INICIALIZAÇÃO ==========
console.log("🚀 Iniciando Bot WhatsApp...");
console.log("⚠️  AVISO: Este bot usa métodos não oficiais do WhatsApp");
console.log("⚠️  Use por sua conta e risco - contas podem ser banidas");
console.log("📱 Aguardando QR Code...\n");

client.initialize();


