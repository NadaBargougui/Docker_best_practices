const express = require('express');
const app = express();
const port = 3000;

app.get('/', (req, res) => {
    res.send('Hello World!');
});

app.listen(port, () => {
    console.log(`App listening at http://localhost:${port}`);
});


// COMMANDS:
// 1) npm init -y : to generate the package.json
// 2) npm install express

// 3) Build your Docker image: docker build -t hello-world-app .
// This command tells Docker to build an image from the current directory (.) and tag it as hello-world-app.
// 4)      ///////////// Start Docker Desktop \\\\\\\\\\\\\\
// 5) Run the container: docker run -p 3000:3000 hello-world-app

// To clean Up:
// docker stop <container_id>
// You can get the container ID by running: docker ps
