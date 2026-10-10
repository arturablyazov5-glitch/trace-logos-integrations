// Minimal Logo factory matching @trace-logos-int/core's Logo shape.
function logo(over = {}) {
  return {
    name: 'Telegram',
    slug: 'telegram',
    category: { slug: 'messengers', name: 'Мессенджеры' },
    tags: [],
    pageUrl: 'https://trace-logos.ru/logos/messengers/telegram/',
    svgUrl: 'https://trace-logos.ru/assets/logos/svgs/telegram.svg',
    pngUrl: undefined,
    variants: [],
    hasSvg: true,
    hasPng: false,
    ...over,
  };
}
module.exports = { logo };
