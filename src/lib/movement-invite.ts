// Convite do Movimento: tom pessoal de presente, sem preço, pagamento nem propaganda
const openings = {
  user: "Oi! Lembrei de você. Estou usando a Olá Aura no meu dia a dia e tem me feito um bem enorme.",
  supporter: "Oi! Lembrei de você. Conheci a Olá Aura e achei um cuidado lindo, pensei que você ia gostar.",
};

const body = "Consegui um convite para você experimentar um primeiro encontro de 45 minutos com a Aura. É um espaço para conversar, clarear os pensamentos e encontrar direção com calma.\n\nSe quiser experimentar, entra por aqui 💚👇";

export const MOVEMENT_INVITE_MESSAGES = {
  user: `${openings.user}\n\n${body}`,
  supporter: `${openings.supporter}\n\n${body}`,
};
