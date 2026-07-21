/* ============================================================
   Dream Legacy RP — Configuración de departamentos y roles de HQ
   ------------------------------------------------------------
   Para añadir un departamento nuevo (abogados, jueces...), añade
   una entrada aquí con sus IDs de rol de Discord. "chief" es quien
   tiene acceso completo a su campo; el resto solo ve Emergencias
   y Anuncios.
   ============================================================ */

// Roles de Discord que dan acceso a admin.dreamlegacyrp.xyz -- nada
// que ver con los departamentos de HQ (LSPD/EMS), es aparte.
export const ADMIN_ROLE_IDS = [
    "1508291739994030241", // Owner
    "1508291930998702373", // Co-Owner
    "1508292052788576359", // Developer
    "1508292146896048248"  // Head Admin
];

export function isAdminRole(discordRoleIds) {
    return discordRoleIds.some((id) => ADMIN_ROLE_IDS.includes(id));
}

export const DEPARTMENTS = {
    police: {
        label: "LSPD",
        roles: [
            { id: "1508293210152108155", name: "Chief of Police", rank: "chief", icon: "👮" },
            { id: "1508293307590119534", name: "Deputy Chief", rank: "member", icon: "👮" },
            { id: "1508293446475972770", name: "Officer", rank: "member", icon: "🚓" },
            { id: "1508293545511878756", name: "Cadet", rank: "member", icon: "🎓" }
        ],
        vehicles: [
            { id: "police_cruiser", name: "Police Cruiser", price: 0, minRoleIndex: 3 },   // Cadet en adelante (gratis)
            { id: "police_interceptor", name: "Police Interceptor", price: 8000, minRoleIndex: 2 }, // Officer+
            { id: "police_suv", name: "Police SUV", price: 15000, minRoleIndex: 1 },        // Deputy Chief+
            { id: "police_helicopter", name: "Police Helicopter", price: 40000, minRoleIndex: 0 } // Chief only
        ]
    },
    ems: {
        label: "EMS",
        roles: [
            { id: "1508293946173034606", name: "EMS Director", rank: "chief", icon: "🚑" },
            { id: "1508294058609737879", name: "Paramedic", rank: "member", icon: "⛑️" },
            { id: "1508294149688791091", name: "Trainee", rank: "member", icon: "🩺" }
        ],
        vehicles: [
            { id: "ems_ambulance", name: "Ambulance", price: 0, minRoleIndex: 2 },
            { id: "ems_rapid_response", name: "Rapid Response Car", price: 10000, minRoleIndex: 1 },
            { id: "ems_helicopter", name: "Medevac Helicopter", price: 40000, minRoleIndex: 0 }
        ]
    }
};

/** Dado un array de IDs de rol que tiene la persona en Discord,
 *  devuelve a que departamento pertenece y con que rango (el mas
 *  alto que tenga, si por lo que sea tiene varios roles del mismo
 *  departamento). Devuelve null si no coincide con ninguno. */
export function resolveDepartment(discordRoleIds) {
    for (const deptKey in DEPARTMENTS) {
        const dept = DEPARTMENTS[deptKey];
        for (let i = 0; i < dept.roles.length; i++) {
            if (discordRoleIds.includes(dept.roles[i].id)) {
                return {
                    department: deptKey,
                    label: dept.label,
                    roleIndex: i,
                    roleName: dept.roles[i].name,
                    rank: dept.roles[i].rank
                };
            }
        }
    }
    return null;
}