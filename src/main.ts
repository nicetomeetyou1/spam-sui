import { TransactionBlock } from '@mysten/sui.js/transactions';
import dotenv from 'dotenv';
import { SuiKit } from '@scallop-io/sui-kit';
import { delay } from './util';
import { getFullnodeUrl } from '@mysten/sui.js/client';
dotenv.config();

const rpcUrl = process.env.RPC_URL ?? getFullnodeUrl('mainnet');
async function constructTxb(suiKit: SuiKit, accountIndex: number) {
  const txb = new TransactionBlock();
  console.log("Address: ", suiKit.getAddress({ accountIndex }));
  txb.setSender(suiKit.getAddress({ accountIndex }));
  const getCounter = await suiKit.client().getOwnedObjects({
    owner: suiKit.getAddress({ accountIndex }),
    filter: {
      MatchAll: [
        {
          StructType: '0x30a644c3485ee9b604f52165668895092191fcaf5489a846afa7fc11cdb9b24a::spam::UserCounter'
        }
      ]
    }
  });
  if (getCounter.data.length === 0) {
    txb.moveCall({
      target: '0x30a644c3485ee9b604f52165668895092191fcaf5489a846afa7fc11cdb9b24a::spam::new_user_counter',
      arguments: [
        txb.object('0x71d2211afbb63a83efc9050ded5c5bb7e58882b17d872e32e632a978ab7b5700')
      ],
    })
  } else {
    txb.moveCall({
      target: '0x30a644c3485ee9b604f52165668895092191fcaf5489a846afa7fc11cdb9b24a::spam::increment_user_counter',
      arguments: [
        txb.object(getCounter.data[0].data?.objectId ?? '')
      ],
    })
  }
  const data = await suiKit.signAndSendTxn(
    txb,
    {
      accountIndex
    }
  );
  console.log("Success spamming user counter: ", data);
}

async function main() {
  const suiKit = new SuiKit({
    mnemonics: process.env.MNEMONICS,
    networkType: 'mainnet',
    fullnodeUrls: [rpcUrl],
  });
  const account = Array.from({ length: Number(process.env.ACCOUNT_AMOUNT ?? 0) }, (_, idx) => idx+1);
  while(true && account.length > 0) {
    const allFunction = account.map((accountIndex) => {
      return constructTxb(suiKit, accountIndex);
    });
    await Promise.all(allFunction);
  }
}
main();