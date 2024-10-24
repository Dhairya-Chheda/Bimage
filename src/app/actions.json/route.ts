import { createActionHeaders, ActionsJson } from "@solana/actions";

export const GET = async () => {
  const payload: ActionsJson = {
    rules: [
      // map all root level routes to an action
      {
        pathPattern: "/unblur/", //Change this url to something that makes branding sense
        apiPath: "/api/unblur",
      },
    ],
  };

  return Response.json(payload, {
    headers: createActionHeaders({
      chainId: "devnet", // or chainId: "devnet"
      actionVersion: "2.2.1", // the desired spec version
    }),
  });
};

// DO NOT FORGET TO INCLUDE THE `OPTIONS` HTTP METHOD
// THIS WILL ENSURE CORS WORKS FOR BLINKS
export const OPTIONS = GET;
