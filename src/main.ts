import { TransactionBlock } from '@mysten/sui.js/transactions';
import dotenv from 'dotenv';
import { SUI_TYPE_ARG, SuiKit } from '@scallop-io/sui-kit';
import { getFullnodeUrl } from '@mysten/sui.js/client';
import fs from 'fs';
import BigNumber from 'bignumber.js';
import { UserCounter } from './type';
dotenv.config();

const PACKAGE_ID = "0x30a644c3485ee9b604f52165668895092191fcaf5489a846afa7fc11cdb9b24a";
const SPAM_SHARED_OBJECT_ID = "0x71d2211afbb63a83efc9050ded5c5bb7e58882b17d872e32e632a978ab7b5700";
const MODULE = "spam";
const SPAM_TYPE_ARG = "0x30a644c3485ee9b604f52165668895092191fcaf5489a846afa7fc11cdb9b24a::spam::SPAM"
const rpcUrl = process.env.RPC_URL ?? getFullnodeUrl('mainnet');

async function getCounterObject(suiKit: SuiKit, accountIndex: number, epoch?: number) {
  let cursor: string | undefined | null = null;
  const counters: UserCounter[] = [];
  do {
    const getCounter = await suiKit.client().getOwnedObjects({
      owner: suiKit.getAddress({ accountIndex }),
      filter: {
        MatchAll: [
          {
            StructType: `${PACKAGE_ID}::${MODULE}::UserCounter`
          }
        ]
      },
      options: {
        showContent: true,
      },
      cursor,
    });

    if(getCounter.hasNextPage) {
      cursor = getCounter.nextCursor;
    }

    getCounter.data.forEach((counter) => {
      const counterContent = counter.data?.content;
      if(counterContent && 'fields' in counterContent) {
        counters.push(counterContent.fields as UserCounter);
      }
    });
  } while (cursor !== null)
  const epochFilter = epoch ?? await getCurrentEpoch(suiKit);
  // Get the counter with the highest tx_count in the specified epoch
  return counters.filter((counter) => Number(counter.epoch) === epochFilter).sort((a, b) => Number(a.tx_count) - (b.tx_count)).pop();
}

async function getCurrentEpoch(suiKit: SuiKit) {
  const { epoch } = await suiKit.client().getLatestSuiSystemState();
  return Number(epoch);
}

async function spamSui(suiKit: SuiKit, accountIndex: number) {
  const counterObj = await getCounterObject(suiKit, accountIndex);
  const txb = new TransactionBlock();
  logDetails(suiKit, accountIndex, counterObj, "Spam Sui");
  txb.setSender(suiKit.getAddress({ accountIndex }));

  if (!counterObj) {
    await createNewCounter(suiKit, txb, accountIndex);
  } else if (Number(counterObj.epoch) !== await getCurrentEpoch(suiKit) && counterObj.registered === false) {
    await registerAndCreateCounter(suiKit, txb, accountIndex, counterObj);
  } else {
    await incrementCounter(suiKit, txb, accountIndex, counterObj);
  }
}

function logDetails(suiKit: SuiKit, accountIndex: number, counterObj: UserCounter | undefined, fromFunction: string) {
  console.log("--------------------------------------------------------------");
  console.log("Execution From: " + fromFunction)
  console.log("Address: " + suiKit.getAddress({ accountIndex }));
  console.log("Total counter: " + String(counterObj?.tx_count ?? 0))
  console.log("--------------------------------------------------------------");
}

async function createNewCounter(suiKit: SuiKit, txb: TransactionBlock, accountIndex: number) {
  txb.moveCall({
    target: `${PACKAGE_ID}::${MODULE}::new_user_counter`,
    arguments: [txb.object(SPAM_SHARED_OBJECT_ID)],
  });
  const data = await suiKit.signAndSendTxn(txb, { accountIndex });
  console.log("\x1b[32m-------------------------------------------------------------- \x1b[0m");
  console.log("\x1b[32mAddress: " + suiKit.getAddress({ accountIndex }) + "\x1b[0m");
  console.log(`\x1b[32mSuccess create new counter: ${data.digest} \x1b[0m`);
  console.log("\x1b[32m-------------------------------------------------------------- \x1b[0m");
}

async function registerAndCreateCounter(suiKit: SuiKit, txb: TransactionBlock, accountIndex: number, counterObj: UserCounter) {
  txb.moveCall({
    target: `${PACKAGE_ID}::${MODULE}::register_user_counter`,
    arguments: [
      txb.object(SPAM_SHARED_OBJECT_ID),
      txb.object(counterObj.id.id)
    ],
  });
  txb.moveCall({
    target: `${PACKAGE_ID}::${MODULE}::new_user_counter`,
    arguments: [
      txb.object(SPAM_SHARED_OBJECT_ID)
    ],
  });
  const data = await suiKit.signAndSendTxn(txb, { accountIndex });
  console.log("\x1b[32m-------------------------------------------------------------- \x1b[0m");
  console.log("\x1b[32mAddress: " + suiKit.getAddress({ accountIndex }) + "\x1b[0m");
  console.log(`\x1b[32mSuccess register and create new counter: ${data.digest} \x1b[0m`);
  console.log("\x1b[32m-------------------------------------------------------------- \x1b[0m");
}

async function incrementCounter(suiKit: SuiKit, txb: TransactionBlock, accountIndex: number, counterObj: UserCounter) {
  txb.moveCall({
    target: `${PACKAGE_ID}::${MODULE}::increment_user_counter`,
    arguments: [txb.object(counterObj.id.id)],
  });
  const data = await suiKit.signAndSendTxn(txb, { accountIndex });
  console.log("\x1b[32m-------------------------------------------------------------- \x1b[0m");
  console.log("\x1b[32mAddress: " + suiKit.getAddress({ accountIndex }) + "\x1b[0m");
  console.log(`\x1b[32mSuccess spamming user counter: ${data.digest} \x1b[0m`);
  console.log("\x1b[32m-------------------------------------------------------------- \x1b[0m");
}

async function claimSpam(suiKit: SuiKit, accountIndex: number) {
  const counterObj = await getCounterObject(suiKit, accountIndex, await getCurrentEpoch(suiKit) - 2);
  if (!counterObj) return;
  logDetails(suiKit, accountIndex, counterObj, "Claim Spam");
  const txb = new TransactionBlock();
  txb.setSender(suiKit.getAddress({ accountIndex }));
  const spam = txb.moveCall({
    target: `${PACKAGE_ID}::${MODULE}::claim_user_counter`,
    arguments: [
      txb.object(SPAM_SHARED_OBJECT_ID),
      txb.object(counterObj.id.id)
    ],
  });
  txb.transferObjects([spam], txb.pure(suiKit.getAddress({ accountIndex })));
  const data = await suiKit.signAndSendTxn(
    txb,
    {
      accountIndex
    }
  );
  console.log("\x1b[32m-------------------------------------------------------------- \x1b[0m");
  console.log("\x1b[32mAddress: " + suiKit.getAddress({ accountIndex }) + "\x1b[0m");
  console.log(`\x1b[32mSuccess claim spam: ${data.digest} \x1b[0m`);
  console.log("\x1b[32m-------------------------------------------------------------- \x1b[0m");
}

async function airdropSui(suiKit: SuiKit, listAccountIndex: number[]) { 
  const txb = new TransactionBlock();
  const addressNeddSui: string[] = [];
  txb.setSender(suiKit.getAddress({ accountIndex: 0 }));
  for(const accountIndex of listAccountIndex) {
    const suiBalance = await suiKit.getBalance(SUI_TYPE_ARG, { accountIndex });
    if (new BigNumber(suiBalance.totalBalance).isLessThan(1e7)) {
      addressNeddSui.push(suiKit.getAddress({ accountIndex }));
    }
  }
  if(addressNeddSui.length === 0) return;
  const coins = txb.splitCoins(txb.gas, Array.from({ length: addressNeddSui.length }, () => 1e9));
  addressNeddSui.forEach((address, idx) => {
    txb.transferObjects([coins[idx]], txb.pure(address));
  })
  const data = await suiKit.signAndSendTxn(
    txb,
    {
      accountIndex: 0
    }
  );
  console.log("Success airdrop SUI: ", data.digest);
}

async function transferAllSpamToMain(address?: string) {
  const suiKit = new SuiKit({
    mnemonics: process.env.MNEMONICS,
    networkType: 'mainnet',
    fullnodeUrls: [rpcUrl],
  });
  const account = Array.from({ length: Number(process.env.ACCOUNT_AMOUNT ?? 0) }, (_, idx) => idx+1);
  account.forEach(async (accountIndex) => {
    let cursor: string | undefined | null = null;
    const spamObj: string[] = [];
    do {
      const getCoin = await suiKit.client().getCoins({
        owner: suiKit.getAddress({ accountIndex }),
        coinType: SPAM_TYPE_ARG,
      });
  
      getCoin.data.forEach((coin) => {
        spamObj.push(coin.coinObjectId);
      });
  
      if(getCoin.hasNextPage) {
        cursor = getCoin.nextCursor;
      }
    } while (cursor !== null)
    if(spamObj.length === 0) return;
    const txb = new TransactionBlock();
    txb.setSender(suiKit.getAddress({ accountIndex }));
    if (spamObj.length > 2) {
      txb.mergeCoins(txb.object(spamObj[0]), spamObj.slice(1).map((obj) => txb.object(obj)));
    }
    txb.transferObjects([txb.object(spamObj[0])], txb.pure(address ?? suiKit.getAddress({ accountIndex: 0 })));
    const data = await suiKit.signAndSendTxn(txb, { accountIndex });
    console.log("\x1b[32m-------------------------------------------------------------- \x1b[0m");
    console.log("\x1b[32mAddress: " + suiKit.getAddress({ accountIndex }) + "\x1b[0m");
    console.log("Success transfer all spam to main: ", data.digest);
    console.log("\x1b[32m-------------------------------------------------------------- \x1b[0m");
  }); 
}

async function main() {
  const suiKit = new SuiKit({
    mnemonics: process.env.MNEMONICS,
    networkType: 'mainnet',
    fullnodeUrls: [rpcUrl],
  });
  const account = Array.from({ length: Number(process.env.ACCOUNT_AMOUNT ?? 0) }, (_, idx) => idx+1);
  while(true && account.length > 0) {
    try {
      const spamFunctions = account.map(accountIndex => spamSui(suiKit, accountIndex));
      const claimFunctions = account.map(accountIndex => claimSpam(suiKit, accountIndex));
      await Promise.all([airdropSui(suiKit, account), ...spamFunctions, ...claimFunctions]);
    } catch (e) {
      console.error(e);
    }
  }
}


main();

// Uncomment this line to transfer all spam to main account
// transferAllSpamToMain();