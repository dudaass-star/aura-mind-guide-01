// Convite do Movimento: tom pessoal de presente, sem preço, pagamento nem propaganda
const openings = {
  user: "Oi! Lembrei de você. Estou usando a Olá Aura no meu dia a dia e tem me feito um bem enorme.",
  supporter: "Oi! Lembrei de você. Conheci a Olá Aura e achei um cuidado lindo, pensei que você ia gostar.",
};

const body = "Consegui um convite para você experimentar: tem um primeiro encontro de 45 minutos de conversa com a Aura, além de orações e meditações guiadas. É um espaço muito especial para desacelerar a mente, rezar e encontrar direção com calma.\n\nSe quiser experimentar, entra por aqui 💚👇";

// Link do convite sempre no domínio oficial, nunca no endereço de prévia
export const movementInviteUrl = (code: string) => `https://olaaura.com.br/degustacao?por=${code}`;

export const MOVEMENT_INVITE_MESSAGES = {
  user: `${openings.user}\n\n${body}`,
  supporter: `${openings.supporter}\n\n${body}`,
};
