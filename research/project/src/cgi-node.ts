#!/opt/node/bin/node

import Crypto = require("crypto");
import FS = require("fs");
import Path = require("path");
import QueryString = require("querystring");
import URL = require("url");
import VM = require("vm");

interface IReadFileOptions {
    readonly encoding: string;
    readonly flag: string;
}

interface IWriteFileOptions {
    readonly encoding: string;
    readonly flag: string;
    readonly mode: number;
}

interface IReadonlyDictionary<T> {
    readonly [propName: string]: T;
}

interface IWritableDictionary<T> {
    [propName: string]: T;
}

interface ICgiNodeConfig {
    readonly SessionCookie: string;
    readonly SessionPath: string;
    readonly SessionTimeOut: number;
    readonly timeout: number;
}

interface ICgiHttpContext {
    include(this: ICgiHttpContext, filePath: string, options?: IReadFileOptions): void;
}

interface ICookie {
    notSent?: boolean;
    readonly domain: string;
    readonly expires: string;
    readonly httpOnly: boolean;
    readonly maxAge: number;
    readonly name: string;
    readonly path: string;
    readonly secure: boolean;
    readonly value: string;
}

interface ISession extends IWritableDictionary<any> {
    readonly cookies: IWritableDictionary<ICookie>;
    readonly data: IWritableDictionary<any>;
    readonly id: string;
    readonly ipAddress: string;
    readonly path: string;
}

interface ICgiHttpSession {
    getCookie(this: ICgiHttpSession, name: string): ICookie;
    getCookies(this: ICgiHttpSession): IReadonlyDictionary<ICookie>;
    getData(this: ICgiHttpSession): IReadonlyDictionary<any>;
    getId(this: ICgiHttpSession): string;
    getIpAddress(this: ICgiHttpSession): string;
    getPath(this: ICgiHttpSession): string;
    save(this: ICgiHttpSession): void;
}

interface ICgiHttpRequest {
    getCookie(this: ICgiHttpRequest, name: string): string;
    getCookies(this: ICgiHttpRequest): IReadonlyDictionary<string>;
    getHeaders(this: ICgiHttpRequest): IReadonlyDictionary<string>;
    getQuery(this: ICgiHttpRequest): QueryString.ParsedUrlQuery;
    getServerVariables(this: ICgiHttpRequest): IReadonlyDictionary<string>;
    getServerVariable(this: ICgiHttpRequest, name: string): string;
    readBody(this: ICgiHttpRequest): Promise<string>;
}

interface ICgiHttpResponse {
    setSession(this: ICgiHttpResponse, session: ICgiHttpSession): void;
    write(this: ICgiHttpResponse, str: string): void;
}

const CgiNodeConfig: ICgiNodeConfig = {
    SessionCookie: "CGI-NODE-SESSIONID",
    SessionPath: "/var/www/cgi-node/sessions/",
    SessionTimeOut: 15 * 60, // 15 minutes
    timeout: 30,
};

function exists(this: void, path: string): Promise<boolean> {
    return new Promise((resolve: (result: boolean) => void): void => {
        FS.access(path, FS.constants.F_OK, (err: Error): void => {
            return resolve(err === null);
        });
    });
}

function readFile(this: void, path: string, options: IReadFileOptions = {encoding: "utf8", flag: "r"}): Promise<string> {
    return new Promise((resolve: (result: string) => void, reject: (reason: Error) => void): void => {
        FS.readFile(path, options, (err: Error, data: string): void => {
            if (err !== null) {
                return reject(err);
            }
            return resolve(data);
        });
    });
}

function writeFile(this: void, file: string, data: string, options: IWriteFileOptions = {encoding: "utf8", mode: 0o644, flag: "w"}): Promise<void> {
    return new Promise((resolve: () => void, reject: (reason: Error) => void) => {
        FS.writeFile(file, data, options, (err: Error): void => {
            if (err !== null) {
                return reject(err);
            }
            return resolve();
        });
    });
}

function CgiNodeInfo(this: void, {request, response, session}: {request: ICgiHttpRequest, response: ICgiHttpResponse, session: ICgiHttpSession}): void {
    const drawObject: (title: string, obj: any) => void = (title: string, obj: any): void => {
        response.write(`<tr><th colspan="2">${title}</th></tr>`);
        Object.keys(obj).forEach((name: string): void => {
            let value: any = obj[name];
            if (typeof value === "function") {
                return;
            } else if (typeof value === "object") {
                let htmlValue: string = `<table class="NodeASPTable" border="0" style="margin: 0px">`;
                Object.keys(value).forEach((subName: string): void => {
                    htmlValue += `<tr><td>${subName}</td><td>${value[subName]}</td></tr>`;
                });
                value = htmlValue + "</table>";
            }
            response.write(`<tr><td>${name}</td><td>${value}</td></tr>`);
        });
    };
    response.write("<!DOCTYPE html>");
    response.write(`<html><head><meta charset="utf-8"><title>CgiNodeInfo</title>`);
    response.write(`<style>.NodeASPTable{ font-family: arial; font-size: 12px; margin: auto; border-collapse: collapse; width: 600px} .NodeASPTable TH{ background-color: #303030; color: white; font-size: 14px; padding: 10px} .NodeASPTable TD{ padding: 5px; } .NodeASPTable TR TD:nth-child(1){ background: #d9ebb3; }</style>`);
    response.write("</head><body>");
    response.write(`<table class="NodeASPTable" border="1">`);
    drawObject("CGI Command Line Arguments", process.argv);
    drawObject("Server Variables", request.getServerVariables());
    drawObject("HTTP Request Headers", request.getHeaders());
    drawObject("HTTP Request Cookies", request.getCookies());
    drawObject("Session", {
        id: session.getId(),
        ipAddress: session.getIpAddress(),
        path: session.getPath(),
    });
    drawObject("Session Cookies", session.getCookies());
    drawObject("Session Data", session.getData());
    drawObject("URL Query String", request.getQuery());
    response.write("</table>");
    response.write("</body></html>");
}

class CgiHttpContext implements ICgiHttpContext {

    private static mapPath(this: void, path: string): string {
        return path;
    }

    private readonly context: VM.Context;

    public constructor({request, response, session}: {request: ICgiHttpRequest, response: ICgiHttpResponse, session: ICgiHttpSession}) {
        const sandbox: any = {
            process,
            request,
            require,
            response,
            session,
            write: response.write,
        };
        sandbox.CgiNodeInfo = CgiNodeInfo.bind(null, {request, response, session});
        this.context = VM.createContext(sandbox);
    }

    public async include(this: CgiHttpContext, filePath: string, options: IReadFileOptions = {encoding: "utf8", flag: "r"}): Promise<void> {
        const path: string = CgiHttpContext.mapPath(filePath);
        const code: string = await readFile(path, options);
        const script: VM.Script = new VM.Script(code, {
            columnOffset: 0,
            displayErrors: true,
            filename: path,
            lineOffset: 0,
            produceCachedData: false,
            timeout: CgiNodeConfig.timeout,
        });
        script.runInContext(this.context, {
            columnOffset: 0,
            displayErrors: true,
            filename: path,
            lineOffset: 0,
            timeout: CgiNodeConfig.timeout,
        });
    }

}

class CgiHttpSession implements ICgiHttpSession, IWritableDictionary<any> {

    public static cleanUp(this: void): void {
        const currentTime: number = (new Date()).valueOf();
        const timeOut: number = CgiNodeConfig.SessionTimeOut * 1000;
        const sessions: ReadonlyArray<string> = FS.readdirSync(CgiNodeConfig.SessionPath);
        for (const filename of sessions) {
            const path: string = Path.join(CgiNodeConfig.SessionPath, filename);
            const stats: FS.Stats = FS.statSync(path);
            if ((stats.mtime.valueOf() + timeOut) < currentTime) {
                FS.unlinkSync(path);
            }
        }
    }

    public static async newInstance(this: void, request: ICgiHttpRequest): Promise<CgiHttpSession> {
        let id: string = request.getCookie(CgiNodeConfig.SessionCookie) ? request.getCookie(CgiNodeConfig.SessionCookie) : await CgiHttpSession.createId(request);
        let path: string = Path.join(CgiNodeConfig.SessionPath, id);
        if (!await exists(path)) {
            id = await CgiHttpSession.createId(request);
            path = Path.join(CgiNodeConfig.SessionPath, id);
        }
        let session: ISession = JSON.parse(await readFile(path));
        if (session.ipAddress !== request.getServerVariable("remote_addr")) {
            id = await CgiHttpSession.createId(request);
            path = Path.join(CgiNodeConfig.SessionPath, id);
            session = JSON.parse(await readFile(path));
        }
        const instance: CgiHttpSession = new CgiHttpSession(id);
        Object.keys(session).forEach((name: string): void => {
            instance[name] = session[name];
        });
        return instance;
    }

    private static async createId(this: void, request: ICgiHttpRequest): Promise<string> {
        const date: Date = new Date();
        const idString: string = request.getServerVariable("remote_addr") + request.getServerVariable("remote_port") + request.getServerVariable("unique_id") + date.valueOf() + Math.random();
        const id: string = Crypto.createHash("md5").update(idString).digest("hex");
        const path: string = Path.join(CgiNodeConfig.SessionPath, id);
        const session: ISession = {
            cookies: {},
            data: {},
            id,
            ipAddress: request.getServerVariable("remote_addr"),
            path,
        };
        session.cookies[CgiNodeConfig.SessionCookie] = {
            domain: "",
            expires: "Thu, 1-Jan-2030 00:00:00 GMT",
            httpOnly: true,
            maxAge: 30 * 60,
            name: CgiNodeConfig.SessionCookie,
            notSent: true,
            path: "/",
            secure: false,
            value: id,
        };
        await writeFile(path, JSON.stringify(session));
        return id;
    }

    [propName: string]: any;

    private readonly data: any = {};

    private readonly id: string;

    private readonly ipAddress: string;

    private readonly path: string;

    private constructor(id: string) {
        this.id = id;
    }

    public getData(this: CgiHttpSession): any {
        return this.data;
    }

    public getId(this: CgiHttpSession): string {
        return this.id;
    }

    public getIpAddress(this: CgiHttpSession): string {
        return this.ipAddress;
    }

    public getPath(this: CgiHttpSession): string {
        return this.path;
    }

    public getCookie(this: CgiHttpSession, name: string): ICookie {
        return this.cookies[name];
    }

    public getCookies(this: CgiHttpSession): IReadonlyDictionary<ICookie> {
        return this.cookies;
    }

    public save(this: CgiHttpSession): void {
        const session: ISession = {
            cookies: this.cookies,
            data: this.data,
            id: this.id,
            ipAddress: this.ipAddress,
            path: this.path,
        };
        FS.writeFileSync(this.path, JSON.stringify(session));
    }

}

class CgiHttpRequest implements ICgiHttpRequest {

    private readonly cookies: IReadonlyDictionary<string> = {};

    private readonly headers: IWritableDictionary<string> = {};

    private readonly httpVersion: string;

    private readonly method: string;

    private readonly query: QueryString.ParsedUrlQuery;

    private readonly serverVariables: IWritableDictionary<string> = {};

    private readonly url: URL.Url;

    public constructor() {
        CgiParser.parseServerVarialbesAndHeaders(process.env, this.serverVariables, this.headers);
        this.method = this.getServerVariable("request_method");
        this.httpVersion = this.getServerVariable("server_protocol");
        this.headers.content_type = (this.serverVariables.hasOwnProperty("content_type") ? this.getServerVariable("content_type") : "");
        this.headers.content_length = (this.serverVariables.hasOwnProperty("content_length") ? this.getServerVariable("content_length") : "0");
        if (this.headers.hasOwnProperty("cookie")) {
            this.cookies = CgiParser.cookies(this.headers.cookie);
        }
        this.url = URL.parse(this.getServerVariable("request_uri"), true);
        this.query = this.url.query as QueryString.ParsedUrlQuery; // TODO: 無検査キャスト
    }

    public getCookie(this: CgiHttpRequest, name: string): string {
        return this.cookies[name];
    }

    public getCookies(this: CgiHttpRequest): IReadonlyDictionary<string> {
        return this.cookies;
    }

    public getHeaders(this: CgiHttpRequest): IReadonlyDictionary<string> {
        return this.headers;
    }

    public getHttpVersion(this: CgiHttpRequest): string {
        return this.httpVersion;
    }

    public getMethod(this: CgiHttpRequest): string {
        return this.method;
    }

    public getQuery(this: CgiHttpRequest): QueryString.ParsedUrlQuery {
        return this.query;
    }

    public getServerVariable(this: CgiHttpRequest, name: string): string {
        return this.serverVariables[name];
    }

    public getServerVariables(this: CgiHttpRequest): IReadonlyDictionary<string> {
        return this.serverVariables;
    }

    public readBody(this: CgiHttpRequest): Promise<string> {
        return new Promise((resolve: (result: string) => void, reject: (reason: Error) => void): void => {
            let data = "";
            process.stdin.on("data", (chunk: string): void => {
                data += chunk;
            });
            process.stdin.on("end", (): void => {
                return resolve(data);
            });
            process.stdin.on("error", (err: NodeJS.ErrnoException): void => {
                return reject(err);
            });
        });
    }

}

class CgiHttpResponse implements ICgiHttpResponse {

    private readonly headers: IReadonlyDictionary<string> = {
        "content-type": "text/html; charset=utf-8",
    };

    private isHeaderSent: boolean;

    private session: ICgiHttpSession;

    public constructor() {
        // empty
    }

    public sendHeaders(this: CgiHttpResponse): void {
        if (this.isHeaderSent) {
            return;
        }
        this.isHeaderSent = true;
        Object.keys(this.headers).forEach((name: string): void => {
            process.stdout.write(`${name}: ${this.headers[name]}`);
            process.stdout.write("\r\n");
        });
        Object.keys(this.session.getCookies()).forEach((name: string): void => {
            const cookie: ICookie = this.session.getCookie(name);
            if (cookie.notSent) {
                delete cookie.notSent;
                process.stdout.write(`Set-Cookie: ${CgiParser.serializeCookie(cookie)}`);
                process.stdout.write("\r\n");
            }
        });
        process.stdout.write("\r\n");
    }

    public setSession(this: CgiHttpResponse, session: ICgiHttpSession): void {
        this.session = session;
    }

    public write(this: CgiHttpResponse, str: string): void {
        this.sendHeaders();
        process.stdout.write(str);
    }

    public end(this: CgiHttpResponse): void {
        this.sendHeaders();
    }
}

class CgiParser {

    public static cookies(this: void, str: string): IReadonlyDictionary<string> {
        const cookies: IWritableDictionary<string> = {};
        const pairs: ReadonlyArray<string> = str.split(";");
        for (const pair of pairs) {
            const indexOfEqual: number = pair.indexOf("=");
            if (indexOfEqual < 0) {
                continue;
            }
            const key: string = pair.substr(0, indexOfEqual).trim();
            let value: string = pair.substr(indexOfEqual + 1, pair.length).trim();
            if (value[0] === `"`) {
                value = value.slice(1, -1);
            }
            try {
                cookies[key] = decodeURIComponent(value);
            } catch (e) {
                cookies[key] = value;
            }
        }
        return cookies;
    }

    public static parseServerVarialbesAndHeaders(this: void, envVariables: NodeJS.ProcessEnv, server: IWritableDictionary<string>, headers: IWritableDictionary<string>): void {
        Object.keys(envVariables).forEach((name: string): void => {
            const value: string | undefined = envVariables[name];
            if (typeof value === "undefined") {
                return;
            }
            name = name.toLowerCase();
            if (name.startsWith("http_")) {
                const offset: number = "http_".length;
                headers[name.substring(offset)] = value;
            } else {
                server[name] = value;
            }
        });
    }

    public static serializeCookie(this: void, cookie: ICookie): string {
        const pairs: string[] = [`${cookie.name}=${encodeURIComponent(cookie.value)}`];
        if (cookie.domain) {
            pairs.push(`Domain=${cookie.domain}`);
        }
        if (cookie.expires) {
            pairs.push(`Expires=${cookie.expires}`);
        }
        if (cookie.httpOnly) {
            pairs.push("HttpOnly");
        }
        if (cookie.maxAge) {
            pairs.push(`Max-Age=${cookie.maxAge}`);
        }
        if (cookie.path) {
            pairs.push(`Path=${cookie.path}`);
        }
        if (cookie.secure) {
            pairs.push("Secure");
        }
        return pairs.join("; ");
    }

    private constructor() {
        throw new Error();
    }

}

(async (): Promise<void> => {
    const request: ICgiHttpRequest = new CgiHttpRequest();
    const response: ICgiHttpResponse = new CgiHttpResponse();
    const session: ICgiHttpSession = await CgiHttpSession.newInstance(request);
    response.setSession(session);
    const cgiHttpContext: ICgiHttpContext = new CgiHttpContext({request, response, session});
    process.on("uncaughtException", (error: Error): void => {
        const htmlError: string = `<br><div style="color:red"><b>EXCEPTION</b>: ${error.message}<i><pre>${error.stack}</pre></i></div><br>`;
        response.write(htmlError);
    });
    process.on("exit", (): void => {
        session.save();
        CgiHttpSession.cleanUp();
    });
    await request.readBody();
    const path: string | undefined = process.env.PATH_TRANSLATED;
    if (typeof path === "undefined") {
        throw new Error();
    }
    await cgiHttpContext.include(path);
})();
