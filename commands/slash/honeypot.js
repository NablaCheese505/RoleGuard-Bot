const { Honeypots } = require('../../database_schema.js');
const { PermissionFlagsBits } = require('discord.js');

module.exports = {
    metadata: {
        name: "honeypot",
        description: "Gestiona los roles trampa (Honeypots) del servidor.",
        default_member_permissions: PermissionFlagsBits.Administrator.toString(), // Solo admins pueden verlo
        options: [
            {
                name: "add",
                description: "Configura un nuevo rol trampa",
                type: 1, // 1 es SUB_COMMAND
                options: [
                    {
                        name: "role",
                        description: "El rol que servirá como trampa",
                        type: 8, // 8 es ROLE
                        required: true
                    },
                    {
                        name: "action",
                        description: "La sanción a aplicar",
                        type: 3, // 3 es STRING
                        required: true,
                        choices: [
                            { name: "Expulsar (Kick)", value: "kick" },
                            { name: "Banear (Ban)", value: "ban" }
                        ]
                    },
                    {
                        name: "reason",
                        description: "La razón de la sanción para el registro de auditoría",
                        type: 3, // 3 es STRING
                        required: false
                    }
                ]
            },
            {
                name: "remove",
                description: "Elimina la configuración de trampa de un rol",
                type: 1, // 1 es SUB_COMMAND
                options: [
                    {
                        name: "role",
                        description: "El rol que dejará de ser una trampa",
                        type: 8, // 8 es ROLE
                        required: true
                    }
                ]
            }
        ]
    },

    async run(client, int, tools) {
        // Obtenemos qué subcomando ejecutó el usuario
        const subCommand = int.options.getSubcommand();
        const guildId = int.guild.id;

        if (subCommand === "add") {
            const role = int.options.getRole("role");
            const action = int.options.getString("action");
            const reason = int.options.getString("reason") || "Activó un rol trampa (Honeypot).";

            // Validaciones de seguridad
            if (role.id === int.guild.roles.everyone.id) {
                return int.reply({ content: "❌ No puedes configurar `@everyone` como un rol trampa.", ephemeral: true });
            }

            if (role.position >= int.guild.members.me.roles.highest.position) {
                return int.reply({ content: "⚠️ El rol seleccionado está por encima del mío. No podré detectar ni sancionar a quien lo reciba.", ephemeral: true });
            }

            // Usamos upsert para actualizar si ya existía o crearlo nuevo
            await Honeypots.findOneAndUpdate(
                { guildId, roleId: role.id },
                { action, reason },
                { upsert: true, new: true }
            );

            return int.reply({ 
                content: `✅ ¡Honeypot configurado!\nCualquiera que obtenga el rol <@&${role.id}> recibirá un **${action.toUpperCase()}**.\n*Razón guardada:* ${reason}`,
                ephemeral: true 
            });
        }

        if (subCommand === "remove") {
            const role = int.options.getRole("role");

            const deleted = await Honeypots.findOneAndDelete({ guildId, roleId: role.id });

            if (!deleted) {
                return int.reply({ content: "⚠️ Ese rol no estaba configurado como un Honeypot.", ephemeral: true });
            }

            return int.reply({ content: `🗑️ El rol <@&${role.id}> ha dejado de ser una trampa.`, ephemeral: true });
        }
    }
}