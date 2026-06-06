// navbar.js
export function loadNavbar() {
    const navbar = document.createElement("nav");
    navbar.innerHTML = `
        <style>
            nav { background: #333; padding: 10px; }
            a { color: white; margin: 10px; text-decoration: none; }
        </style>
        <nav>
            <a href="index.html">Home</a>
            <a href="about.html">About</a>
            <a href="contact.html">Contact</a>
        </nav>
    `;
    return navbar;
}
