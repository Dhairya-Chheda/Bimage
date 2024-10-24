import {
  ActionPostResponse,
  createActionHeaders,
  ACTIONS_CORS_HEADERS,
  createPostResponse,
  ActionGetResponse,
  ActionPostRequest,
  MEMO_PROGRAM_ID,
  Action,
} from "@solana/actions";
import {
  createTransferCheckedInstruction,
  getAssociatedTokenAddress,
  TOKEN_PROGRAM_ID,
} from "@solana/spl-token";
import {
  Connection,
  Keypair,
  PublicKey,
  sendAndConfirmRawTransaction,
  sendAndConfirmTransaction,
  Transaction,
  VersionedTransaction,
  SystemProgram,
  LAMPORTS_PER_SOL,
  TransactionInstruction,
} from "@solana/web3.js";

// import { log } from "console";

const CONNECTION = new Connection(
  "https://devnet.helius-rpc.com/?api-key=0769fcf3-0514-4eee-95e7-485431ab941e",
  { commitment: "confirmed" }
);

const BRIDGE_ACCOUNT = new PublicKey("56R9tMteM2zaWfNAtEPX7ALYH7gKcVwm1RSmt7nFLLcR");

var USER_ACCOUNT;

const comission = 0.1  // Mentioned as percentage aka means 10%

const headers = createActionHeaders({
  headers: ACTIONS_CORS_HEADERS,
  chainId: "devnet", // or chainId: "devnet"
  actionVersion: "2.2.1", // the desired spec version
});

export const GET = async (req: Request) => {
  try {
    const requestUrl = new URL(req.url);
    const baseHref = new URL(`/api/unblur`,requestUrl.origin).toString();

    // const userName = requestUrl.searchParams.get('user')
    // const databaseId = requestUrl.searchParams.get('i')

    // Using the API get the Title, description, image link, and the price. 

    // Check for username and databaseId and perform error handling accordingly
    // If there is an error, we can show our own default blink?

    const payload: ActionGetResponse = {
      title: "Unblur an Image",
      icon: new URL("./Balaji-Blur.png", requestUrl.origin).toString(),
      description:
        "Unblur image to come closer to your creator",
      label: "Unblur",
      links: {
        actions: [
          {
            label: "Unblur Image",
            href: `${baseHref}?amountInUSDC={amountInUSDC}`,
            parameters: [
              {
                name: "amountInUSDC",
                label: "USDC Amount",
                required: true,
              },
            ],
            type: "transaction", // Example type, adjust as necessary
          }
        ],
      },
    };

    return Response.json(payload, {
      headers: headers,
    });
  } catch (err) {
    console.error(err);
    let message = "An unknown error occurred";
    if (typeof err == "string") message = err;
    return new Response(message, {
      status: 400,
      headers: headers,
    });
  }
};

export const OPTIONS = GET;

export const POST = async (req: Request) => {
  try {
    const requestUrl = new URL(req.url);
    
    //Getting the path in order to determine the user and also determine the users image
    // const pathName = requestUrl.pathname
    // const pathArray = pathName.split('/').filter(part => part.length > 0);
    // console.log(pathArray);
    
    const amountInUSDC = Number(requestUrl.searchParams.get("amountInUSDC") || "0");
    let usdcToUser = (amountInUSDC * (1 - comission) ) * 1e6 ;
    let usdcToAdmin = (amountInUSDC * comission) * 1e6 ;


    if (amountInUSDC <= 0) {
      throw new Error("Invalid USDC amount");
    }

    const body: ActionPostRequest = await req.json();

    let account: PublicKey;
    try {
      account = new PublicKey(body.account);
    } catch (err) {
      return new Response('Invalid "account" provided', {
        status: 400,
        headers: headers,
      });
    }


    // USDC Transaction
    const usdc_pub_key_devnet = new PublicKey("4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU");
    
    const usdc_pub_key_mainnet = new PublicKey("EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v");

    const fromAta = await getAssociatedTokenAddress(usdc_pub_key_devnet, account);
    
    const toAtaUser = await getAssociatedTokenAddress(usdc_pub_key_devnet, BRIDGE_ACCOUNT); // Change this to USER_ACCOUNT

    // const toAtaAdmin = await getAssociatedTokenAddress(usdc_pub_key_devnet, BRIDGE_ACCOUNT);

    // console.log("toAta", toAta.toBase58());
    
    
    let transaction = new Transaction().add( // For User
      createTransferCheckedInstruction( 
        fromAta, // from (should be a token account)
        usdc_pub_key_devnet, // mint
        toAtaUser, // to (should be a token account)   // This shall be the users account
        account, // from's owner
        usdcToUser, // amount, USDC has 6 decimals so 1e5 is 0.1 USDC
        6 // decimals
      )
    )
    // .add( // For Admin
    //   createTransferCheckedInstruction(
    //     fromAta, // from (should be a token account)
    //     usdc_pub_key_devnet, // mint
    //     toAtaAdmin, // to (should be a token account)   // This shall be the users account
    //     account, // from's owner
    //     usdcToAdmin, // amount, USDC has 6 decimals so 1e5 is 0.1 USDC
    //     6 // decimals
    //   )
    // )
    ;
    
    // console.log(transaction);
    
    // SOL TRANSACTION
    // let transaction = new Transaction().add(
    //   SystemProgram.transfer({
    //       fromPubkey: new PublicKey(account),
    //       toPubkey: new PublicKey(BRIDGE_ACCOUNT), //Replace with user's account
    //       lamports: LAMPORTS_PER_SOL * parseFloat(`${amountInUSDC}`) * 0.9,
    //     }),
    //   SystemProgram.transfer({
    //       fromPubkey: new PublicKey(account),
    //       toPubkey: new PublicKey(BRIDGE_ACCOUNT),
    //       lamports: LAMPORTS_PER_SOL * parseFloat(`${amountInUSDC}`) * 0.1,
    //     })
    //   );
          
      
    const messageToAddInMemo =
    "to:" + account.toBase58() + ",amount:" + amountInUSDC * LAMPORTS_PER_SOL;
    
    const memoInstruction = new TransactionInstruction({
      keys: [{ pubkey: account, isSigner: true, isWritable: true }],
      programId: new PublicKey(MEMO_PROGRAM_ID),
      data: Buffer.from(messageToAddInMemo, "utf-8"),
    });
    
    transaction.add(memoInstruction);

    // console.log(transaction.serialize());
    
    transaction.feePayer = new PublicKey(account);

    const latestBlockhash = await CONNECTION.getLatestBlockhash();
    transaction!.recentBlockhash = latestBlockhash.blockhash;
      
    transaction!.lastValidBlockHeight = latestBlockhash.lastValidBlockHeight;

    // console.log(transaction.serialize());
    

    const nextPayload: Action = {
      title: "Know More",
      icon: new URL("./Balaji.png", requestUrl.origin).toString(),
      description: "Want to see more, go check out your creator!",
      label: "Know more",
      links: {
        actions: [
          {
            label: "Know more",
            href: "https://www.wixfreaks.com",
            type: "external-link",
          }
        ],
      },
      type: "action"
    };

    const payload: ActionPostResponse = await createPostResponse({
      fields: {
        type: "transaction",
        transaction,
        message:"Transaction approved, you can unblur this now",
        links: {
          next: {
            type: 'inline',
            action: nextPayload
          }
        }
      },
    });

    return Response.json(payload, {
      headers: headers,
    });
  } catch (err) {
    console.error(err);
    let message = "An unknown error occurred";
    if (err instanceof Error) message = err.message;
    return new Response(message, {
      status: 400,
      headers: headers,
    });
  }
};

