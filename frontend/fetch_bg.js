const fs = require('fs');
fetch('https://wekraft.xyz')
  .then(r => r.text())
  .then(html => {
     let match;
     const regex = /https?:\/\/[^\s"'<>()]+?\.(?:png|jpg|jpeg|webp|svg)/gi;
     const urls = new Set();
     while ((match = regex.exec(html)) !== null) {
       urls.add(match[0]);
     }
     // also find next.js static assets without the domain
     const regex2 = /\/_next\/static\/media\/[^"'<>()]+?\.(?:png|jpg|jpeg|webp)/gi;
     while ((match = regex2.exec(html)) !== null) {
       urls.add('https://wekraft.xyz' + match[0]);
     }
     const regex3 = /\/images\/[^"'<>()]+?\.(?:png|jpg|jpeg|webp)/gi;
     while ((match = regex3.exec(html)) !== null) {
       urls.add('https://wekraft.xyz' + match[0]);
     }
     fs.writeFileSync('urls.txt', Array.from(urls).join('\n'));
  })
  .catch(console.error);
