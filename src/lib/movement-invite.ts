const openings = {
  user: "Oi! Olha só o que eu descobri: a Olá Aura! Estou usando e está me fazendo muito bem. Acho que você vai adorar também.",
  supporter: "Oi! Olha só o que eu descobri: a Olá Aura! Conheci a proposta e achei fantástica. Acho que vale conhecer também!",
};

const body = "É um app pra conversar sobre o que você está vivendo e encontrar compreensão, apoio e direção — inclusive quando é difícil explicar o que está acontecendo.\n\nE tem uma coisa que me fez gostar ainda mais: o Movimento Olá Aura, pra que mais pessoas encontrem apoio e não precisem enfrentar tudo sozinhas. Estou fazendo parte e lembrei de você. 💚\n\nDá pra experimentar pelo valor de um cafezinho. ☕\n\nVem conhecer também! Depois me conta o que achou 👇";

export const MOVEMENT_INVITE_MESSAGES = {
  user: `${openings.user}\n\n${body}`,
  supporter: `${openings.supporter}\n\n${body}`,
};