/**
 * Illustrates the middleware feature of the Express framework.
 */
const express = require("express");
const http = require("http");
const assert = require("assert").strict;
const { once } = require("events");
const logger = require("morgan");
const fs = require("fs");
const path = require("path");
const helpers = require("./helpers");

describe("Middleware", function () {
    const SERVER_ROOT_PATH = helpers.generateSeverRootPath();

    // Create a temporary directory used as a web-server root dir by
    // the tests. Additionally, create some HTML, CSS and JS files in
    // that directory
    before(() => {
        helpers.createServerRootDir(SERVER_ROOT_PATH);
    });

    // Remove the temporary web-server root dir
    after(async () => {
        await helpers.removeServerRootDir(SERVER_ROOT_PATH);
    });

    it('illustrates defining single middleware', async function () {
        const app = express();

        // Register a single middleware handler
        app.use((req, res) => {
            res.status(200).end("ABCD", "utf8");
        });

        const httpServer = await helpers.startHttpServer(app);

        // Create a HTTP request and send it to the server and end
        // the request which flushes all its data to the server
        http.request({
                hostname: "localhost",
                port: httpServer.address().port,
                path: "/",
                method: "GET"
            },
            res => {
                // Response should have 200 status code
                assert.equal(res.statusCode, 200);

                // Set encoding used to encode received data to strings
                res.setEncoding("utf8");

                // Attach listener for `data` event
                let receivedData = "";
                res.on("data", chunk => {
                    receivedData += chunk;
                });

                // Attach listener for `end` event
                res.once("end", () => {
                    assert.deepEqual(receivedData, "ABCD");

                    // Close the server
                    httpServer.close();
                });
            })
            .end();

        // Wait for the server to close
        await once(httpServer, "close");
    });

    it('illustrates defining multiple middleware', async function () {
        const actionLog = [];
        const app = express();

        // The first is a passive middleware that doesn't modify neither
        // request nor response
        app.use((req, res, next) => {
            actionLog.push("middleware 1 before next");

            // Execute the next middleware
            next();

            actionLog.push("middleware 1 after next");
        });

        // The second is a fake authentication middleware that accepts
        // every second request and rejects the rest. If requests is
        // accepted the last middleware is executed
        let reqIndex = 0;
        app.use((req, res, next) => {
            if (reqIndex++ % 2 === 0) {
                actionLog.push("middleware 2 before next");

                // This is an even request, execute the last middleware
                // in the chain
                next();

                actionLog.push("middleware 2 after next");
            }
            else {
                actionLog.push("middleware 2");

                // Reject the request with 403 status (Not Authorized)
                res.statusCode = 403;
                res.statusMessage = "Not Authorized";
                res.end();
            }
        });

        // The last middleware ends the request/response exchange with
        // 200 OK
        app.use((req, res) => {
            actionLog.push("middleware 3");

            // Accept the request with 200 OK and some data
            res.status(200).end("ABCDE");
        });

        const httpServer = await helpers.startHttpServer(app);

        // Create and send a few HTTP requests
        const options = {
            hostname: "localhost",
            port: httpServer.address().port,
            path: "/",
            method: "GET"
        };

        const reqCount = 2;
        for (let i = 0; i < reqCount; ++i) {
            http.request(
                options,
                res => {
                    if (i % 2 === 0) {
                        // Even requests are accepted
                        assert.equal(res.statusCode, 200);
                    }
                    else {
                        // Odd requests are rejected with 403
                        assert.equal(res.statusCode, 403);
                        assert.equal(res.statusMessage, "Not Authorized");
                    }

                    // Set encoding used to encode received data to strings
                    res.setEncoding("utf8");

                    // Attach listener for `data` event
                    let receivedData = "";
                    res.on("data", chunk => {
                        receivedData += chunk;
                    });

                    // Attach listener for `end` event
                    res.once("end", () => {
                        if (i % 2 === 0) {
                            assert.deepEqual(receivedData, "ABCDE");
                        }
                        else {
                            assert.deepEqual(receivedData, "");
                        }

                        // Close the server if this is the response to the last
                        // request
                        if (i === reqCount - 1) {
                            httpServer.close();
                        }
                    });
                })
                .end();
        }

        // Wait for the server to close
        await once(httpServer, "close");

        // Note that all middleware are executed synchronously in a batch. Calling
        // next() executes the next middleware right away, it doesn't schedule the
        // next middleware to be executed asynchronously with process.nextTick for
        // example
        assert.deepEqual(actionLog, [
            // The logs for the first request/response exchange
            "middleware 1 before next",
            "middleware 2 before next",
            "middleware 3",
            "middleware 2 after next",
            "middleware 1 after next",

            // The logs for the second request/response exchange
            "middleware 1 before next",
            "middleware 2",
            "middleware 1 after next"
        ]);
    });

    it('illustrates using Morgan logger', async function () {
        const app = express();

        // Use Morgan logger as the first middleware
        app.use(logger("short"));

        // Register another middleware
        app.use((req, res) => {
            res.status(200).end("ABCD");
        });

        const httpServer = await helpers.startHttpServer(app);

        // Create a HTTP request and send it to the server and end
        // the request which flushes all its data to the server
        http.request({
                hostname: "localhost",
                port: httpServer.address().port,
                path: "/",
                method: "GET"
            },
            res => {
                // Response should have 200 status code
                assert.equal(res.statusCode, 200);

                // Set encoding used to encode received data to strings
                res.setEncoding("utf8");

                // Attach listener for `data` event
                let receivedData = "";
                res.on("data", chunk => {
                    receivedData += chunk;
                });

                // Attach listener for `end` event
                res.once("end", () => {
                    assert.deepEqual(receivedData, "ABCD");

                    // Close the server
                    httpServer.close();
                });
            })
            .end();

        // Wait for the server to close
        await once(httpServer, "close");
    });

    it('illustrates using express.static for serving files', async function () {
        const app = express();

        // Use express.static middleware that will serve requested files
        app.use(express.static(SERVER_ROOT_PATH));

        // If express.static can't find the requested file it moves to the
        // next middleware instead of failing with 404
        app.use((req, res) => {
            res.writeHead(404, "Not Found").end();
        });

        const httpServer = await helpers.startHttpServer(app);

        // Enumerate all files to be retrieved from the server
        const filesToGet = [];
        const serverDir = fs.opendirSync(SERVER_ROOT_PATH);
        for await (const dirEntry of serverDir) {
            if (dirEntry.isFile()) {
                filesToGet.push(dirEntry.name);
            }
        }

        // Request an unknown file from the server as well
        filesToGet.push(Date.now().toString() + ".html");

        // Retrieve each of the files from the web-server's public directory
        for (let i = 0; i < filesToGet.length; ++i) {
            http.request({
                    hostname: "localhost",
                    port: httpServer.address().port,
                    path: path.join("/", filesToGet[i]),
                    method: "GET"
                },
                res => {
                    if (i === filesToGet.length - 1) {
                        // The last requested file doesn't exist on the server
                        assert.equal(res.statusCode, 404);
                        assert.deepEqual(res.statusMessage, "Not Found");
                    }
                    else {
                        // Response should have 200 status code
                        assert.equal(res.statusCode, 200);
                    }

                    // Set encoding used to encode received data to strings
                    res.setEncoding("utf8");

                    // Attach listener for `data` event
                    let receivedData = "";
                    res.on("data", chunk => {
                        receivedData += chunk;
                    });

                    // Attach listener for `end` event
                    res.once("end", () => {
                        if (i < filesToGet.length - 1) {
                            // Compare the body with the actual data in the file. The comparison
                            // is not done for the last file because that file doesn't exist
                            assert.deepEqual(
                                receivedData,
                                fs.readFileSync(path.join(SERVER_ROOT_PATH, filesToGet[i]), "utf8"));
                        }

                        // Close the server if this is the last response
                        if (i === filesToGet.length - 1) {
                            httpServer.close();
                        }
                    });
                })
                .end();
        }

        // Wait for the server to close
        await once(httpServer, "close");
    });

    it('illustrates error-handling middleware', async function () {
        const app = express();

        // Define a middleware that will switch into error-mode if
        // URL is equal to /error
        app.use((req, res, next) => {
            if (req.url === "/error") {
                // Switch into error-mode by passing an argument to the
                // `next` method
                next(new Error("An error occurred"));
            }
            else {
                // Send some data to the client and end the request
                res.send("ABCDE");
            }
        });

        // Define an error-handling middleware that will be executed if
        // express app enters the error-mode (i.e. `next` is called with
        // an argument
        app.use((err, req, res, next) => {
            // Fail with 500 status code (internal server error)
            res.sendStatus(500);
        });

        const httpServer = await helpers.startHttpServer(app);

        // The client sends two requests, the second one will cause an
        // internal server error (500 status code)
        const urlsToRequest = ["/resource", "/error"];

        for (let i = 0; i < urlsToRequest.length; ++i) {
            http.request({
                    hostname: "localhost",
                    port: httpServer.address().port,
                    path: urlsToRequest[i],
                    method: "GET"
                },
                res => {
                    if (i === 0) {
                        // Response should have 200 status code
                        assert.equal(res.statusCode, 200);
                    }
                    else {
                        // Response should have 500 status code
                        assert.equal(res.statusCode, 500);
                    }

                    // Set encoding used to encode received data to strings
                    res.setEncoding("utf8");

                    // Attach listener for `data` event
                    let receivedData = "";
                    res.on("data", chunk => {
                        receivedData += chunk;
                    });

                    // Attach listener for `end` event
                    res.once("end", () => {
                        if (i === 0) {
                            assert.deepEqual(receivedData, "ABCDE");
                        }

                        // Close the server if this is the last response
                        if (i === urlsToRequest.length - 1) {
                            httpServer.close();
                        }
                    });
                })
                .end();
        }

        // Wait for the server to close
        await once(httpServer, "close");
    });
});