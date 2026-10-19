// Convite do Movimento: tom pessoal de presente, sem preço nem propaganda
const openings = {
  user: "Oi! Lembrei muito de você. Estou usando a Olá Aura nos meus dias difíceis e tem me feito um bem enorme.",
  supporter: "Oi! Lembrei muito de você. Conheci a Olá Aura e achei um cuidado lindo com quem está passando por um momento difícil.",
};

const body = "Consegui um convite para você fazer um encontro gratuito de 45 minutos com a Aura, sem pagar nada e sem cartão. É um espaço seguro pra desabafar, organizar os pensamentos e encontrar direção.\n\nSe você estiver precisando de um momento de paz, entra por aqui 💚👇";

export const MOVEMENT_INVITE_MESSAGES = {
  user: `${openings.user}\n\n${body}`,
  supporter: `${openings.supporter}\n\n${body}`,
};
