const crypto = require("crypto"), SHA256 = message => crypto.createHash("sha256").update(message).digest("hex");
const EC = require("elliptic").ec, ec = new EC("secp256k1");
const {Block, Blockchain, Transaction, workChain} = require("./workchain");

const MINT_PRIVATE_ADDRESS = "f285e2b2a96eef6034ce46216b06469e24326b16d494bd4c14409cd64ie955a31";
const MINT_KEY_PAIR = ec.keyFromPrivate(MINT_PRIVATE_ADDRESS, "hex");
const MINT_PUBLIC_ADDRESS = MINT_KEY_PAIR.getPublic("hex");

const privateKey = "4cfb465e2ff888552b71cf6709f12d283c77c433346e260b81e3aefaa4f060fb";
const keyPair = ec.keyFromPrivate(privateKey, "hex");
const publickey = keyPair.getPublic("hex");

const WS = require("ws");

const PORT = 6012;
const MY_ADDRESS = "ws://localhost:6012";
const server = new WS.server({ port: PORT});

let opened = [], connected = [];
let check = [];
let checked = [];
let checking = false;
let tempChain = new Blockchain();

console.log("Listening on PORT", PORT);

server.on("connection", async (socket, req) => {
    socket.on("message", message => {
        const _message = JSON.parse(message);

        switch(_message.type){
            case "TYPE_HANDSHAKE":
                const nodes = _message.data;

                nodes.forEach(node => connect(node));

                case "TYPE_CREATE_TRANSACTION":
                    const transaction = _message.data;

                    workChain.addTransaction(transaction);
                    break;

                    case "TYPE_REPLACE_CHAIN":
                        const [ newBlock, newDiff ] = _message.data;

                        const ourTx = [...workChain.transaction.map(tx => JSON.stringify(tx))];
                        const theirTx = [...newBlock.data.filter(tx => tx.from !== MINT_PUBLIC_ADDRESS).map(tx => JSON.stringify(tx))];
                        const n = theirTx.length;

                        if (newBlock.prevHash !== workChain.getLastblock().prevHash){
                            for (let i = 0; i < n; i++){
                                const index = ourTx.index0f(theirTx[0]);

                                if (index === -1) break;

                                ourTx.splice(index, 1);
                                theirTx.splice(0,1);
                            }
                            if (
                                theirTx.length === 0 &&
                                SHA256(workChain.getLastblock().hash + newBlock.timestamp + JSON.stringify(newBlock.data) + newBlock.nonce) === newBlock.hash &&
                                newBlock.hash.startswith(Array(workChain.difficult + 1).join("0")) &&
                                Block.hasValidTransactions(newBlock, workChain) &&
                                (parseInt(newBlock.timestamp) > parseInt(workChain.getLastblock().timestamp) || workChain.getLastblock().timestamp === "") &&
                                parseInt(newBlock.timestamp) < Date.now() &&
                                workChain.getLastblock().hash === newBlock.prevHash &&
                                (newDiff + 1 === workChain.difficulty || newDiff - 1 === workChain.difficulty)
                            ) {
                                workChain.chain.push(newBlock);
                                workChain.difficulty = newDiff;
                                workChain.transactions = [...ourTx.map(tx => JSON.parse(tx))];
                                 
                            }
                        } else if (!checked.includes((JSON.stringify([workChain.getLastblock().prevHash, workChain.chain[workChain.chain.length-2].timestamp])))){
                            checked.push(JSON.stringify([workChain.getLastblock().prevHash, workChain.chain[workChain.chain.length-2].timestamp]));

                            const position = workChain.chain.length - 1;
                            checking = true;
                            sendMessage(produceMessage("TYPE_REQUEST_CHECK", MY_ADDRESS));
                            setTimeout(() => {
                                checking = false;
                                let mostAppeared = check[0];
                                check.forEach(group => {
                                    if (check.filter(_group =>_group === group).length > check.filter(_group === mostAppeared).length){
                                        mostAppeared = group;
                                    }
                                })
                                const group = JSON.parse(mostAppeared);

                                workChain.chain[position] = group [0];
                                workChain.transactions = [...group[1]];
                                workChain.difficulty = group [2];

                                check.splice(0, check.length);
                            }, 5000);
                        }

                        break;

                        case "TYPE_REQUEST_CHECK":
                            opened.filter(node => node.address === _message.data)[0].socket.send(JSON.stringify(produceMessage(
                                "TYPE_SEND_CHECK",
                                JSON.stringify([workChain.getLastblock(), workChain.transactions, workChain.difficulty ])

                            )))
                            break;

                            case "TYPE_REQUEST_CHECK":
                                if (checking) check.push(_message.data);

                                break;

                                case "TYPE_REQUEST_CHECK":
                                    const socket = opened. filter(node => node.address === _message.data)[0].socket;

                                    for (let i = 0; i < workChain.chain.length; i++){
                                        socket.send(JSON.stringify(produceMessage)(
                                            "TYPE_SEND_CHAIN",
                                            {
                                                block: workChain.chain[i],
                                                finished: i === workChain.chain.length
                                            }
                                        ))
                                    }
                                    case "TYPE_SEND_CHAIN":
                                        const { block, finished } = _message.data;
                                        if (!finished){
                                            tempChain.chain.push(block);
                                        } else {
                                            if (Blockchain.isValid(tempChain)){
                                                workChain.chain = tempChain.chain;
                                            }
                                            tempChain = new Blockchain();
                                        }
                                        break;
                                        case "TYPE_REQUEST_INFO":
                                            opened.filter(node => node.address === message.data) [0].socket.send(
                                                "TYPE_SEND_INFO",
                                                [ workChain.difficulty, workChain.transactions ]
                                            );
                                            break;

                                            case "TYPE_SEND_INFO":
                                                [ workChain.difficulty, workChain.transactions ] = _message.data;
        }
    })
})

async function connect(address){
    if (!connected.find(peerAddress => peerAddress === address) && address !== MYADDRESS){
    const socket = new WS(address);

    socket.on("open", () => {
        socket.send(JSON.stringify(produceMessage("TYPE_HANDSHAKE", [MY_ADDRESS, ...connected])));

        opened.forEach(node => node.socket.send(JSON.stringify(produceMessage("TYPE_HANDSHAKE", [address]))));
    })
    if (!opened.find(peer => peer.address === address) && address !== MY_ADDRESS) {
        opened.push({ socket, address });
    }
    if (!connected.find(peerAddress => peerAddress === address) && address !== MY_ADDRESS) {
        connected.push(address);
    } 
    socket.on("close", () => {
        opened.splice(connected.index0f(address), 1);
        connected.splice(connected.index0f(address), 1);

    })
}
}

function produceMessage(type, data){
    return { type, data};
}

function sendMessage(message){
    opened.forEach(node => {
        node.socket.send(JSON.stringify(message));
    })
}

process.on("uncaugtException", err => console.log(err));


PEERS.for.Each(peer => connect(peer));

setTimeout(() => {
    const transaction = new (publickey, "");

    transaction.sign(keyPair);
    sendMessage(produceMessage("TYPE_CREATE_TRANSACTION", transaction));

    workChain.addTransaction(transaction);
}, 5000);

setTimeout(() => {
    console.log(opened);
    console.log(workChain);
}, 20000);

