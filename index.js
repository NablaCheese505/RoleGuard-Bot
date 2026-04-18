require('dotenv').config();
const Discord = require("discord.js")
const fs = require("fs")

const config = require("./config.json")
const Tools = require("./classes/Tools.js")
const Model = require("./classes/DatabaseModel.js")
const RoleManager = require("./classes/RoleManager.js")

// automatic files: these handle discord status and version number
const autoPath = "./json/auto/"
if (!fs.existsSync(autoPath)) fs.mkdirSync(autoPath)
if (!fs.existsSync(autoPath + "status.json")) fs.copyFileSync("./json/default_status.json", autoPath + "status.json")
if (!fs.existsSync(autoPath + "version.json")) fs.writeFileSync(autoPath + "version.json", JSON.stringify({ version: "1.0.0", updated: Date.now() }, null, 2))

const rawStatus = require("./json/auto/status.json")
const version = require("./json/auto/version.json")

const startTime = Date.now()

// create client
const client = new Discord.Client({
    allowedMentions: { parse: ["users"] },
    makeCache: Discord.Options.cacheWithLimits({
        ...Discord.Options.DefaultMakeCacheSettings, 
        MessageManager: 0, 
        PresenceManager: 0, 
        ReactionManager: 0, 
        ThreadMemberManager: 0, 
        ThreadManager: 0,
        VoiceStateManager: 0
    }),
    sweepers: {
        ...Discord.Options.DefaultSweeperSettings,
        messages: { interval: 3600, lifetime: 1800 }
    },
    intents: ['Guilds', 'GuildMembers'].map(i => Discord.GatewayIntentBits[i]),
    failIfNotExists: false
})

client.globalTools = new Tools(client);

// connect to db
const dbModels = require("./database_schema.js");
client.db = {
    settings: dbModels.GuildSettings,
    honeypots: dbModels.Honeypots,
    dependencies: dbModels.Dependencies
};

client.roleManager = new RoleManager(client);

// command files
const dir = "./commands/"
client.commands = new Discord.Collection()
fs.readdirSync(dir).forEach(type => {
    fs.readdirSync(dir + type).filter(x => x.endsWith(".js")).forEach(file => {
        let command = require(dir + type + "/" + file)
        if (!command.metadata) command.metadata = { name: file.split(".js")[0] }
        command.metadata.type = type
        client.commands.set(command.metadata.name, command)
    })
})

client.statusData = rawStatus
client.updateStatus = function() {
    let status = client.statusData
    client.user.setPresence({ activities: status.type ? [{ name: status.name, state: status.state || undefined, type: Discord.ActivityType[status.type], url: status.url }] : [], status: status.status })
}

// when online
client.on("ready", () => {
    console.log(`Bot online! (${+process.uptime().toFixed(2)} secs)`)
    client.startupTime = Date.now() - startTime
    client.version = version

    client.application.commands.fetch() // cache slash commands
    .then(cmds => {
        if (cmds.size < 1 && client.commands.has("deploy")) { 
            console.info("!!! No global commands found, deploying dev commands to test server (Use /deploy global=true to deploy global commands)")
            client.commands.get("deploy").run(client, null, client.globalTools)
        }
    })

    client.updateStatus()
    setInterval(client.updateStatus, 15 * 60000);
})

client.on("guildMemberUpdate", async (oldMember, newMember) => {
    if (newMember.user.bot) return; // Ignoramos a otros bots
    client.roleManager.handleUpdate(oldMember, newMember);    
})

// on interaction
client.on("interactionCreate", async int => {
    if (!int.guild) return int.reply("You can't use commands in DMs!")

    // general commands and buttons
    let foundCommand = client.commands.get(int.isButton() ? `button:${int.customId.split("~")[0]}` : int.commandName)
    if (!foundCommand) return
    else if (foundCommand.metadata.slashEquivalent) foundCommand = client.commands.get(foundCommand.metadata.slashEquivalent)

    let tools = new Tools(client, int)

    // dev perm check
    if (foundCommand.metadata.dev && !tools.isDev()) return tools.warn("Only developers can use this!")
    else if (config.lockBotToDevOnly && !tools.isDev()) return tools.warn("Only developers can use this bot!")

    try { await foundCommand.run(client, int, tools) }
    catch(e) { console.error(e); int.reply({ content: "**Error!** " + e.message, ephemeral: true }) }
})

client.on('error', e => console.warn(e))
client.on('warn', e => console.warn(e))

process.on('uncaughtException', e => console.warn(e))
process.on('unhandledRejection', (e, p) => console.warn(e))

client.login(process.env.DISCORD_TOKEN)