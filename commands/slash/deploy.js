const { REST, Routes } = require('discord.js');
const config = require('../../config.json');

module.exports = {
    metadata: {
        name: "deploy",
        description: "Actualiza los comandos de barra en el servidor.",
        dev: true, // Protegido para que solo tú (ID en config.json) puedas usarlo
        options: [
            {
                name: "global",
                description: "¿Desplegar globalmente? (Puede tardar hasta 1 hora en reflejarse)",
                type: 5, // 5 = BOOLEAN
                required: false
            }
        ]
    },
    
    async run(client, int, tools) {
        // Si int es null, significa que index.js lo ejecutó automáticamente en el arranque
        const isGlobal = int ? int.options?.getBoolean("global") : false;
        
        // Recolectar todos los comandos de la carpeta 'slash'
        const commandsData = [];
        client.commands.forEach(cmd => {
            if (cmd.metadata.type === "slash") {
                commandsData.push({
                    name: cmd.metadata.name,
                    description: cmd.metadata.description || "Sin descripción",
                    options: cmd.metadata.options || [],
                    default_member_permissions: cmd.metadata.default_member_permissions || null
                });
            }
        });

        // Inicializar el cliente REST nativo de Discord.js
        const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);

        try {
            if (int) await int.reply({ content: `⏳ Desplegando ${commandsData.length} comandos...`, ephemeral: true });
            else console.log(`[Deploy] Auto-desplegando ${commandsData.length} comandos en servidores de prueba...`);

            if (isGlobal) {
                // Despliegue global
                await rest.put(
                    Routes.applicationCommands(client.user.id),
                    { body: commandsData }
                );
                if (int) await int.editReply("✅ ¡Comandos globales actualizados! (Recuerda reiniciar tu app de Discord)");
                else console.log("[Deploy] Comandos globales listos.");
            } else {
                // Despliegue local (Servidores de prueba en config.json)
                for (const guildId of config.test_server_ids) {
                    try {
                        await rest.put(
                            Routes.applicationGuildCommands(client.user.id, guildId),
                            { body: commandsData }
                        );
                        console.log(`[Deploy] Comandos actualizados en el servidor ${guildId}`);
                    } catch (err) {
                        console.log(`[Deploy] No se pudo desplegar en ${guildId} (Quizás el bot no ha sido invitado allí)`);
                    }
                }
                if (int) await int.editReply("✅ ¡Comandos de prueba actualizados de forma instantánea!");
            }
        } catch (error) {
            console.error("[Deploy] Error fatal al publicar comandos:", error);
            if (int) await int.editReply(`❌ Hubo un error: ${error.message}`);
        }
    }
};