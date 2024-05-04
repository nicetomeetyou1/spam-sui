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
const rpcUrl = process.env.RPC_URL ?? getFullnodeUrl('mainnet');

async function getCounterObject(suiKit: SuiKit, accountIndex: number) {
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
  return counters.sort((a, b) => Number(a.epoch) - Number(b.epoch)).pop();
}

async function getCurrentEpoch(suiKit: SuiKit) {
  const { epoch } = await suiKit.client().getLatestSuiSystemState();
  return Number(epoch);
}

async function spamSui(suiKit: SuiKit, accountIndex: number) {
  const txb = new TransactionBlock();
  console.log("Address: ", suiKit.getAddress({ accountIndex }));
  txb.setSender(suiKit.getAddress({ accountIndex }));
  const counterObj = await getCounterObject(suiKit, accountIndex);

  if (!counterObj || counterObj.registered === true) {
    // Create new counter object
    txb.moveCall({
      target: `${PACKAGE_ID}::${MODULE}::new_user_counter`,
      arguments: [
        txb.object(SPAM_SHARED_OBJECT_ID)
      ],
    });
  } else if (Number(counterObj.epoch) !== await getCurrentEpoch(suiKit) && counterObj.registered === false) {
    // Register counter for claim at epoch n+2
    txb.moveCall({
      target: `${PACKAGE_ID}::${MODULE}::register_user_counter`,
      arguments: [
        txb.object(SPAM_SHARED_OBJECT_ID),
        txb.object(counterObj.id.id)
      ],
    });
  } else {
    // Increment counter
    txb.moveCall({
      target: `${PACKAGE_ID}::${MODULE}::increment_user_counter`,
      arguments: [
        txb.object(counterObj.id.id)
      ],
    })
  }
  const data = await suiKit.signAndSendTxn(
    txb,
    {
      accountIndex
    }
  );
  console.log("Success spamming user counter: ", data.digest);
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

async function main() {
  const suiKit = new SuiKit({
    mnemonics: process.env.MNEMONICS,
    networkType: 'mainnet',
    fullnodeUrls: [rpcUrl],
  });
  const account = Array.from({ length: Number(process.env.ACCOUNT_AMOUNT ?? 0) }, (_, idx) => idx+1);
  while(true && account.length > 0) {
    try {
      const allFunction = [airdropSui(suiKit, account), ...account.map((accountIndex) => {
        return spamSui(suiKit, accountIndex);
      })];
      await Promise.all(allFunction);
    } catch (e) {
      console.error(e);
    }
  }
}
main();