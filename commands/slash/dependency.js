const { Dependencies } = require('../../database_schema.js');
const { PermissionFlagsBits } = require('discord.js');

module.exports = {
    metadata: {
        name: "dependency",
        description: "Gestiona los roles condicionales (Dependencias) del servidor.",
        default_member_permissions: PermissionFlagsBits.Administrator.toString(), // Solo admins
        options: [
            {
                name: "link",
                description: "Vincula un rol secundario a un rol principal (Si pierde el principal, pierde el secundario).",
                type: 1, // SUB_COMMAND
                options: [
                    {
                        name: "parent",
                        description: "El rol principal / requisito (Ej. Server Booster)",
                        type: 8, // ROLE
                        required: true
                    },
                    {
                        name: "child",
                        description: "El rol secundario / recompensa (Ej. Color Rosa)",
                        type: 8, // ROLE
                        required: true
                    }
                ]
            },
            {
                name: "unlink",
                description: "Desvincula un rol secundario de su rol principal.",
                type: 1, // SUB_COMMAND
                options: [
                    {
                        name: "parent",
                        description: "El rol principal",
                        type: 8, // ROLE
                        required: true
                    },
                    {
                        name: "child",
                        description: "El rol secundario a desvincular",
                        type: 8, // ROLE
                        required: true
                    }
                ]
            },
            {
                name: "list",
                description: "Muestra la lista de dependencias de roles en este servidor.",
                type: 1 // SUB_COMMAND
            }
        ]
    },

    async run(client, int, tools) {
        const subCommand = int.options.getSubcommand();
        const guildId = int.guild.id;

        if (subCommand === "link") {
            const parent = int.options.getRole("parent");
            const child = int.options.getRole("child");

            if (parent.id === child.id) {
                return int.reply({ content: "❌ Un rol no puede depender de sí mismo.", ephemeral: true });
            }

            // Validar jerarquía: el bot debe tener permisos para quitar el rol hijo
            if (child.position >= int.guild.members.me.roles.highest.position) {
                return int.reply({ content: `⚠️ No puedo gestionar el rol <@&${child.id}> porque está por encima de mi rol más alto en la jerarquía del servidor.`, ephemeral: true });
            }

            // Upsert: Busca el documento. Si existe, añade el rol al array sin duplicados ($addToSet). Si no, lo crea.
            await Dependencies.findOneAndUpdate(
                { guildId, parentRoleId: parent.id },
                { $addToSet: { dependentRoles: child.id } },
                { upsert: true, new: true }
            );

            return int.reply({ 
                content: `🔗 **Dependencia enlazada:**\nAhora, si alguien pierde el rol <@&${parent.id}>, el bot le quitará automáticamente el rol <@&${child.id}>.`, 
                ephemeral: true 
            });
        }

        if (subCommand === "unlink") {
            const parent = int.options.getRole("parent");
            const child = int.options.getRole("child");

            // Buscar el documento del rol padre
            const depRecord = await Dependencies.findOne({ guildId, parentRoleId: parent.id });

            if (!depRecord || !depRecord.dependentRoles.includes(child.id)) {
                return int.reply({ content: "⚠️ Esta dependencia no existe en la base de datos.", ephemeral: true });
            }

            // Quitar el rol hijo del array
            depRecord.dependentRoles = depRecord.dependentRoles.filter(id => id !== child.id);

            // Si el array queda vacío, borramos el documento para no tener basura en Mongo. Si no, lo guardamos.
            if (depRecord.dependentRoles.length === 0) {
                await Dependencies.deleteOne({ _id: depRecord._id });
            } else {
                await depRecord.save();
            }

            return int.reply({ content: `✂️ **Desvinculado:**\nEl rol <@&${child.id}> ya no depende de <@&${parent.id}>.`, ephemeral: true });
        }

        if (subCommand === "list") {
            const deps = await Dependencies.find({ guildId });

            if (deps.length === 0) {
                return int.reply({ content: "📋 No hay dependencias de roles configuradas en este servidor.", ephemeral: true });
            }

            let desc = "";
            deps.forEach(dep => {
                const childMentions = dep.dependentRoles.map(id => `<@&${id}>`).join(", ");
                desc += `**Padre:** <@&${dep.parentRoleId}>\n↳ **Hijos:** ${childMentions}\n\n`;
            });

            // Reutilizamos tu clase global tools para hacer el embed, ya que funciona perfectamente
            let embed = tools.createEmbed({
                title: "🔗 Dependencias de Roles",
                description: desc,
                color: tools.COLOR
            });

            return int.reply({ embeds: [embed], ephemeral: true });
        }
    }
}