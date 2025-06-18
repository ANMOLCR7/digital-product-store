// Modified Buy Now (Free Download) logic
const container = document.getElementById('product-container');
container.innerHTML = `
  <img src="${product.image}" alt="${product.title}" style="max-width:300px"/>
  <h2>${product.title}</h2>
  <p>${product.description}</p>
  <br/>
  <a href="/download/${product.file}" download>
    <button>Download Now</button>
  </a>
`;
