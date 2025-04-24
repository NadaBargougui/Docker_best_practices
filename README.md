# \\\\\\\* 10 best practices to containerize Node.js web applications with Docker \*///////

# 1. Use Docker Base Image 'Tags'

#////////////////////////////////////

# Don't

    FROM node

# DO

    FROM node:16.17.0-bullseye-slim

#////////////////////////////////////

# WHY?

1. Using 'FROM node' means 'node:latest' tag, that means every build will pull
   a newly built Docker image of node. => We don’t want to introduce this
   sort of non-deterministic behavior.

2. The node Docker image is full of libraries and tools that you may not
   need to run your Node.js web application. This has two downsides:

- Firstly a bigger image means a bigger download size which, besides
  increasing the storage requirement, means more time to download
  and re-build the image. (Taille a9al= Attack surface a9al)!
- Secondly, it means you’re potentially introducing security vulnerabilities,
  that may exist in all of these libraries and tools, into the image.

# Recommandations are:

1. Use small Docker images
2. Use the Docker image 'digest', which is the static 'SHA256 hash' (uniquely identify a specific image version)
   of the image. This ensures that you are getting deterministic Docker image builds from the base image.

# However!

# Using image 'digest SHA' ??

Even tho with using 'AS base' ('multi stage builds') for the production, it could still pull new
builds of that tag because Docker image tags are 'mutable' (not fixed and can be updated to
point to newer image builds). That is why to lock your project to a specific build of node:20.9.0-alpine,
we can use a 'digest SHA':
FROM node:20.9.0-bullseye-slim@sha256:330fa0342b6ad2cbdab30ac44195660af5a1f298cc499d8cbdf7496b02ea17d8

Rq: 'Alpine (which is a 'Variant': refers to different builds of an image that provide the
same software but with different base OS configurations. It is based on Debian Linux
(a stable Linux distribution))' Docker image have a smaller software footprint, however, it
substantially differs in other traits and that makes it a non-optimal
production base image for Node.js application runtimes. Furthermore,
many security vulnerabilities scanners can’t easily detect software artifacts
or runtimes on Node.js Alpine images.

# BUT!!

Using the Docker image 'digest' could be confusing or counterproductive for some 'image scanning tools'
who may not know how to interpret this. For that reason, using an explicit Node.js runtime version such as
20.9.0 is preferred. Even if theoretically it is mutable and can be overridden, in practice, if it needs
to receive security or other updates they will be pushed to a new version such as 20.9.1 so it is safe
enough to assume deterministic builds.
FROM node:16.17.0-bullseye-slim

# 2. Install only production dependencies in the Node.js Docker image

#////////////////////////////////////

# Don't

    RUN npm install

# DO

    RUN npm ci --only=production

#////////////////////////////////////

# WHY?

'npm install' installs all dependencies in the container, including devDependencies, which aren’t needed
for a functional application to work.
'Running npm ci --only=production' or 'npm install --production' will install only dependencies needed
for runtime, making the image smaller.

# 3. Optimize Node.js tooling for production

#////////////////////////////////////

# DO

    ENV NODE_ENV production

#////////////////////////////////////

# WHY?

Setting NODE_ENV to "production" in a Dockerfile tells Node.js and various packages that the application
is running in a production environment.

- Effects of NODE_ENV=production:
  ● Skips installing devDependencies (like testing frameworks, linters, and debugging tools)
  in package.json.  
   ● Some libraries behave differently in production to improve security.
  ● Debugging tools and unnecessary logs are disabled..

# 4. Don’t run containers as root

#////////////////////////////////////

# DO

    USER node

and do not forget to
COPY --chown=node:node . /usr/src/app

#////////////////////////////////////

# WHY?

● The principle of least privilege is a security principle from the early days of Unix.
if an attacker is able to compromise the web application in a way that allows for 'command injection'
or 'directory path traversal', then these will be invoked with the user who owns the application process.
If that process happens to be root then they can do virtually everything within the container, including
attempting a 'container escape' or 'privilege escalation'.

● By default, Docker containers run as the root user, which means that if an attacker exploits a vulnerability
in the container, they could gain root access to the host system.
Using a 'non-root user' minimizes the risk of privilege escalation attacks.

● By default, when you use COPY or ADD, files are copied into the container owned by root.
However, if your container runs as a non-root user (like node), it may not have permission to access or modify
these files. Using '--chown=node:node' ensures that the copied files are owned by the non-root user, preventing
permission issues.

# /////////////////////////////////////////////////////////////////////////////////////////////////////////////////

# 5. Safely terminate Node.js Docker web applications

#////////////////////////////////////

# Don't

    CMD “npm” “start”
    CMD [“yarn”, “start”]
    CMD “node” “server.js”
    CMD “start-app.sh”

# DO

    RUN apt-get update && apt-get install -y --no-install-recommends dumb-init
    ENTRYPOINT ["/usr/bin/dumb-init", "--"]
    CMD ["node", "server.js"]

#////////////////////////////////////

# WHY?

● When a Docker container is stopped or restarted, the orchestrator (like Kubernetes) sends signals like 'SIGTERM' ('Enables Graceful Shutdown')
to the running process, asking it to clean up and terminate properly. The application needs to respond to that signal by
stopping its work, closing connections, and cleaning up before the container is fully shut down.

● Problem 1: (Not being the direct process that handles signals)
There could be a scenario where the main application process in a Docker container is not the direct process that handles
signals like SIGTERM. Instead, it may be wrapped by another process (like a shell script or a process manager), which can
prevent it from receiving those signals directly.

- Example: 'CMD "npm" "start"'
  we’re indirectly running the node application by directly invoking the npm client.

# => 'npm' does not automatically forward all signals, such as SIGTERM, to the Node.js process.

● Problem 2: (How the container executes the command)

1. Shellform Notation
   Shellform notation is when the CMD directive is written as a string ('CMD npm start').
   In this case, Docker uses a shell (like '/bin/sh' or '/bin/bash') to run the command.

- How it works: Docker will run the command by spawning a shell, and this shell will execute npm start.

# ==> The problem here is that signals like SIGTERM are sent to the shell (PID 1), not to the Node.js process

# (npm start runs node server.js in the background). The shell might not forward those signals to the node process,

# and that means your Node.js app will not get the shutdown signals and may not terminate gracefully.

2. Execform Notation
   Execform notation is when the CMD directive is specified as a JSON array ('CMD ["npm", "start"]'), with each part of the
   command as a separate element.

# This form does not spawn a shell, but directly runs the command as the main process.

==> Solutoin: we want to improve our Dockerfile process execution directive as follows:
CMD ["node", "server.js"]

● In Docker containers, the PID 1 issue (running Node.js or any process as the main process inside the container)
means that the process may not handle termination signals like 'SIGTERM' (used for graceful termination) correctly. This can prevent
the container from shutting down cleanly, causing potential issues with restarting containers, handling scaling events, or
interacting with orchestrators.

Using a process supervisor (like dumb-init or a small init system) as PID 1 in a container helps forward signals
correctly and ensures a more predictable and graceful shutdown.

==> we want to improve our Dockerfile process execution directive as follows:
CMD ["node", "server.js"]

# BUT!!

When processes run as PID 1 they effectively take on some of the responsibilities of an init system, which is typically
responsible for managing processes and ensuring proper cleanup when a system shuts down.
The kernel treats PID 1 in a different way than it treats other process identifiers. This special treatment from the kernel
means that the handling of a SIGTERM signal to a running process 'won’t invoke a default fallback behavior of killing the
process if the process doesn’t already set a handler for it'.

# Why Do We Need a Default Fallback Behavior of Killing a Process??

Normally, when a process receives SIGTERM, if it does not handle it explicitly, the default Linux behavior is to 'kill the process'.
BUT if a process is running as PID 1, the Linux kernel treats it differently:

# If PID 1 doesn’t handle SIGTERM, nothing happens (it ignores it by deafault)! It won’t exit unless explicitly told to do so.

==> Solution: Use a tool that will act like an init process
==> One such tool that we use at Snyk is 'dumb-init'

RUN apt-get update && apt-get install -y --no-install-recommends dumb-init
CMD ["dumb-init", "node", "server.js"]

Instead of running Node.js as PID 1, we use 'dumb-init' to:

✅ Run as PID 1

✅ Start Node.js as a child process

✅ Forward signals to Node.js properly
This way, when Docker sends SIGTERM, dumb-init ensures that Node.js receives it and exits gracefully.

● Improvement:
A better approach is to use ENTRYPOINT to set dumb-init as the default process:
ENTRYPOINT ["/usr/bin/dumb-init", "--"]
CMD ["node", "server.js"]
==> With this setup, if you override the command at runtime (docker run), dumb-init still runs.

- Tip: it’s even better to install the dumb-init tool in an earlier build stage image, and then copy the
  resulting /usr/bin/dumb-init file to the final container image to keep that image clean.

#////////////////////////////////////////////////////////////////////////////////////////////////////////////////

# 6. Graceful shutdown for your Node.js web applications

#////////////////////////////////////

# DO

-     Add an 'event handler'
  #////////////////////////////////////

# WHY?

If we’re already discussing process signals that terminate applications, let’s make sure we’re shutting them down
properly and gracefully without disrupting users.

When a Node.js application receives an interrupt signal, also known as 'SIGINT', or 'CTRL+C', it will cause an abrupt process kill.
This means that connected clients to a web application will be immediately disconnected.
Now, imagine hundreds of Node.js web containers orchestrated by Kubernetes, going up and down as needs arise to scale or manage errors.
Not the greatest user experience!

To provide a better experience, we can do the following: 1. Set an event handler for the various termination signals like SIGINT and SIGTERM. 2. The handler waits for clean up operations like database connections, ongoing HTTP requests and others. 3. The handler then terminates the Node.js process.
Let’s add our event handler for 'Fastify':

        async function closeGracefully(signal) {
           console.log(`*^!@4=> Received signal to terminate: ${signal}`)

           await fastify.close()
           // await db.close() if we have a db connection in this app
           // await other things we should cleanup nicely
           process.kill(process.pid, signal);
        }
        process.once('SIGINT', closeGracefully)
        process.once('SIGTERM', closeGracefully)

==> This is more of a generic web application concern than Dockerfile related, but is even more important in orchestrated environments!

# 7. Find and fix security vulnerabilities in your Node.js docker image

#////////////////////////////////////

# DO

    Use 'Snyk CLI' to test your Docker image

#////////////////////////////////////

# HOW?

$ npm install -g snyk
$ snyk auth
$ snyk container test node:20.9.0-bullseye-slim --file=Dockerfile

# Fixing Docker image vulnerabilities

1. One effective and quick way to keep up with secure software in your Docker image is to rebuild the Docker image.
   You would depend on the upstream Docker base image you use to fetch these updates for you.
2. Another way is to explicitly install OS system updates for packages, including security fixes.

⚠️ With the official Node.js Docker image, the team may be slower to respond with image updates and so rebuilding
the Node.js Docker image 20.9.0-bullseye-slim or lts-bullseye-slim will not be effective.

3. The other option is to manage your own base image with up-to-date software from Debian. In our Dockerfile we can do:
   RUN apt-get update && apt-get upgrade -y

=> While it seems that a specific Node.js runtime version such as FROM node:14.2.0-slim is good enough because you specified
a specific version and also the use of a small container image (due to the slim image tag), Snyk is able to find security
vulnerabilities from 2 primary sources:

1. Security issues in the Node.js runtime.
   ==> The immediate fix to these would be to upgrade to a newer Node.js version, which Snyk tells you about and also tells you
   which version fixed it.

2. Tooling and libraries installed in this debian base image, such as glibc, bzip2, gcc, perl, bash, tar, libcrypt and others.
   While these vulnerable versions in the container may not pose an immediate threat, why have them if we’re not using them?

⚠️ Snyk also recommends other base images to switch to, so you don’t have to figure this out yourself.

# 8. Use multi-stage builds

# ////////////////////////////////////

# HOW?

Multi-stage builds are a great way to move from a simple, yet potentially erroneous Dockerfile, into separated steps of building a
Docker image, so we can avoid leaking sensitive information. Not only that, but we can also use a bigger Docker base image to install
our dependencies, compile any native npm packages if needed, and then copy all these artifacts into a small production base image,

● Prevent sensitive information leak:

If you’re building Docker images for work, there’s a high chance that you also maintain private npm packages. If that’s the case, then
you probably needed to find some way to make that secret 'NPM_TOKEN' available to the npm install.

    FROM node:20.9.0-bullseye-slim
    RUN apt-get update && apt-get install -y --no-install-recommends dumb-init
    ENV NODE_ENV production
    ENV NPM_TOKEN 1234
    WORKDIR /usr/src/app
    COPY --chown=node:node . .

    RUN echo "//registry.npmjs.org/:_authToken=$NPM_TOKEN" > .npmrc && \
    npm ci --only=production
    USER node
    CMD ["dumb-init", "node", "server.js"]

#/////////////////////////////////////////

The RUN echo line essentially allows the container to authenticate with npm’s registry using the token, so you can
install private packages from npm.

⚠️ Storing sensitive data like the npm token inside the .npmrc file in the Docker image is a security risk,
because anyone who can access the image or its layers can retrieve the token. To mitigate this, you can delete the .npmrc file
after it’s used in your Dockerfile. So we should delete it afterward:
rm -f .npmrc

⚠️ Docker uses a layered approach when building images. Every instruction in the Dockerfile creates a new layer in the image,
and those layers are stored in the image s history. Even if you delete the .npmrc file in the same command, Docker will still
keep the file in the previous layers.

The solution:
To ensure that the .npmrc file is not even accessible in the image s history, we can combine the creation of the .npmrc file
and the cleanup into a single RUN step.
By combining the echo, npm ci, and rm -f .npmrc into a single RUN command, you ensure that everything happens in a single layer.
The .npmrc file is never saved in an intermediate layer, and thus, it won’t be exposed in the final image.

    RUN echo "//registry.npmjs.org/:_authToken=$NPM_TOKEN" > .npmrc && \
    npm ci --only=production && \
    rm -f .npmrc

⚠️ The problem now is that the Dockerfile itself needs to be treated as a secret asset, because it contains the secret npm token.
Luckily, Docker supports a way to pass arguments into the build process:

ARG NPM_TOKEN
And then we build it as follows:
$ docker build . -t nodejs-tutorial --build-arg NPM_TOKEN=1234

⚠️ The problem now that build arguments passed like that to Docker are kept in the history log.
You will see it if you run: $ docker history nodejs-tutorial

# Introducing multi-stage builds for Node.js Docker images

We’ll have one image that we use to build everything that we need for the Node.js application to run, which in a Node.js world, means installing
npm packages, and compiling native npm modules if necessary. That will be our first stage (build image).
The second Docker image, representing the second stage of the Docker build, will be the production Docker image. This second and last stage is the
image that we actually optimize for and publish to a registry.

Here is the update to our Dockerfile that represents our progress so far, but separated into two stages:

    # --------------> The build image

FROM node:latest AS build
RUN apt-get update && apt-get install -y --no-install-recommends dumb-init
ARG NPM_TOKEN
WORKDIR /usr/src/app
COPY package\*.json /usr/src/app/ # done before running npm ci, so Docker can cache dependencies
RUN echo "//registry.npmjs.org/:\_authToken=$NPM_TOKEN" > .npmrc && \ # Writes the NPM_token to .npmrc for authentication
npm ci --only=production && \
 rm -f .npmrc

#--------------> The production image

FROM node:20.9.0-bullseye-slim
ENV NODE_ENV production
COPY --from=build /usr/bin/dumb-init /usr/bin/dumb-init # Copies dumb-init from the build stage into the production image.
USER node # Runs the application as the node user instead of root
WORKDIR /usr/src/app
COPY --chown=node:node --from=build /usr/src/app/node_modules /usr/src/app/node_modules # Copies dependencies (node_modules) from the build stage
COPY --chown=node:node . /usr/src/app # Copies the full source code (.) into the container
CMD ["dumb-init", "node", "server.js"]

# 9. Keeping unnecessary files out of your Node.js Docker images

#////////////////////////////////////

# HOW?

Put '.dockerignore'- 'node_modules'- 'npm-debug.log'- 'Dockerfile'- '.git'- '.gitignore' in the '.dockerignore' file.
The importance of having a .dockerignore is that when we do a COPY . /usr/src/app from the 2nd Dockerfile stage, we’re also copying over any local node_modules/
to the Docker image.
=> That’s a big NO as we may be copying over modified source code inside node_modules/.
=> It helps speed up Docker builds because it ignores files that would have otherwise caused a cache invalidation.

# 10. Mounting secrets into the Docker build image

#////////////////////////////////////

# HOW?

The .dockerignore file applies to the entire build context and cannot be turned on/off for different stages of a multi-stage Docker build. This means:

- If you ignore a file (like .npmrc) using .dockerignore, it will be unavailable in all stages, including the build stage where you might need it.
- If you don’t ignore it, it will be included in all stages, including the production image, which is risky since .npmrc contains sensitive credentials (NPM token).

* Worarounds:

  1️⃣ Use rm -f .npmrc After Installing Dependencies

  2️⃣ Mount .npmrc as a Secret instead of Copying it using Docker BuildKit secrets:

  DOCKER_BUILDKIT=1 docker build --secret id=npmrc,src=$HOME/.npmrc .
  and put '.npmrc' in the '.dockerignore'

=> This makes .npmrc available only during the build, but it won’t be copied into the final image.
It mounts the .npmrc file as a secret, making it temporarily available only during the build step.
Once npm ci runs, the secret disappears and never exists inside the image layers.

Note: Secrets are a new feature in Docker and if you’re using an older version, you might need to enable it Buildkit as follows:

    $ DOCKER_BUILDKIT=1 docker build . -t
    nodejs-tutorial --build-arg NPM_TOKEN=1234
    --secret id=npmrc,src=.npmrc

Finally we have:

# --------------> The build image

    FROM node:latest AS build
    RUN apt-get update && apt-get install -y --no-install-recommends dumb-init
    WORKDIR /usr/src/app
    COPY package\*.json /usr/src/app/
    RUN --mount=type=secret,mode=0644,id=npmrc,target=/usr/src/app/.npmrc npm ci --only=production

# --------------> The production image

    FROM node:20.9.0-bullseye-slim
    ENV NODE_ENV production
    COPY --from=build /usr/bin/dumb-init /usr/bin/dumb-init
    USER node
    WORKDIR /usr/src/app
    COPY --chown=node:node --from=build /usr/src/app/node_modules /usr/src/app/node_modules
    COPY --chown=node:node . /usr/src/app
    CMD ["dumb-init", "node", "server.js"]

And finally, the command that builds the Node.js Docker image:

    $ docker build . -t nodejs-tutorial --secret
    id=npmrc,src=.npmrc

🌸🐶🍓✨💖🐱🌈🌻🎀🦄💫🐰🍉🎶🐣🍩💎🥰🌸🐶🍓✨💖🐱🌈🌻🎀🦄💫🐰🍉🎶🐣🍩💎🥰🌸🐶🍓✨💖🐱🌈🌻🎀🦄💫🐰🍉🎶🐣🍩💎🥰

# \\\\\\\\\\\\ Trivy /////////

Trivy is a fast, free, and open-source security scanner for Docker images, filesystems,
Kubernetes, and cloud services.

# Install Trivy

# Install Trivy locally:

- Go to the official GitHub releases page (https://github.com/aquasecurity/trivy/releases)
- Scroll down to the "Assets" section
- Download the file:
- For Windows (64-bit): trivy_0.41.0_windows-64bit.zip (or the latest version available)
- Extract the ZIP file to a folder

# Add Trivy to the System PATH with the command (or manually):

setx PATH "%PATH%;C:\Users\User\Downloads\trivy_0.59.
1_windows-64bit"

# Verify Installation

    trivy --version

# Scan an Image

    trivy image <image name>

exp: trivy image hello-world-app

🌸🐶🍓✨💖🐱🌈🌻🎀🦄💫🐰🍉🎶🐣🍩💎🥰🌸🐶🍓✨💖🐱🌈🌻🎀🦄💫🐰🍉🎶🐣🍩💎🥰🌸🐶🍓✨💖🐱🌈🌻🎀🦄💫🐰🍉🎶🐣🍩💎🥰
