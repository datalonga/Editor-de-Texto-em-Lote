/** Exemplos prontos para onboarding em 1 clique. */
export const EXAMPLES = [
  {
    id: 'downloads',
    name: 'Pasta de downloads bagunçada',
    content: [
      'Relatório Final (2).pdf',
      'Documento - Cópia.docx',
      'IMG_20240513_182233.jpg',
      'planilha de custos  FINAL v3.xlsx',
      'Captura de Tela 2024-05-10 às 14.32.11.png',
      'Contrato de aluguel assinado - Copia.pdf',
      'Música Nova (1).mp3',
      'Baixado do site (3).zip',
    ].join('\n'),
  },
  {
    id: 'photos',
    name: 'Álbum de fotos',
    content: [
      'DSC_0012.JPG',
      'DSC_0013.JPG',
      'DSC_0014.JPG',
      'Viagem Praia 001.jpg',
      'Viagem Praia 002.jpg',
      'aniversario_mãe_2024.png',
      'IMG-20240513-WA0031.jpg',
    ].join('\n'),
  },
  {
    id: 'music',
    name: 'Playlist para organizar',
    content: [
      '01 - Legião Urbana - Tempo Perdido.mp3',
      '02 - Legião Urbana - Eduardo e Mônica.mp3',
      '03 - Legião Urbana - Será.mp3',
      '04 - Legião Urbana - Que País É Este.mp3',
    ].join('\n'),
  },
  {
    id: 'academic',
    name: 'Documentos acadêmicos',
    content: [
      'SILVA, João - Metodologia Científica (2019).pdf',
      'SOUZA, Maria - Introdução à Estatística.pdf',
      'PEREIRA, Ana - Redação Científica - 2ª ed.pdf',
      'artigo sobre machine learning final v2.pdf',
    ].join('\n'),
  },
  {
    id: 'big',
    name: 'Lista grande (5.000 itens) — teste de performance',
    content: Array.from({ length: 5000 }, (_, i) => {
      const mod = i % 5;
      if (mod === 0) return `Relatório Final (${i}).pdf`;
      if (mod === 1) return `IMG_2024${String(i).padStart(4, '0')}_foto.JPG`;
      if (mod === 2) return `documento - Cópia ${i}.docx`;
      if (mod === 3) return `Planilha de Custos  FINAL v${i}.xlsx`;
      return `Captura de Tela 2024-05-10 às 14.${String(i % 60).padStart(2, '0')}.png`;
    }).join('\n'),
    generated: true,
  },
];
