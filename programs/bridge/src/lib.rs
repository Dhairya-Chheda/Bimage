use anchor_lang::prelude::*;
use anchor_spl::{
    associated_token::{ self, AssociatedToken, Create },
    token::{ self, CloseAccount, Mint, Token, TokenAccount, Transfer },
};

use anchor_lang::system_program;
use solana_program::system_instruction;

declare_id!("2XNgTUe9guXtwMxFQJvgqqrYEj4XPkKxv7mtqmLBoZNr");

#[program]
pub mod bridge {
    use super::*;

    pub fn initialize(ctx: Context<Initialize>) -> Result<()> {
        let txn_counter = &mut ctx.accounts.txn_counter;
        txn_counter.counter = 0;
        Ok(())
    }

    // whilst creating a txn, lock the funds in the source chain
    // and create a PDA account with the details of the txn

    pub fn create_txn(
        ctx: Context<CreatingTxn>,
        tx_id: String,
        amount: u64,
        to: Pubkey
    ) -> Result<()> {
        // create a txn_data account
        let txn_data = &mut ctx.accounts.txn_data;
        txn_data.tx_id = tx_id.parse().unwrap();
        txn_data.from = *ctx.accounts.creator.key;
        txn_data.to = to;
        txn_data.amount = amount;
        txn_data.completed = false;

        // increment the txn counter
        let txn_counter = &mut ctx.accounts.txn_counter;
        txn_counter.counter += 1;

        let from_account = &ctx.accounts.creator;
        let to_account = ctx.accounts.txn_data.to_account_info();

        let transfer_instruction = anchor_lang::solana_program::system_instruction::transfer(
            from_account.key,
            to_account.key,
            amount
        );

        // Invoke the transfer instruction

        anchor_lang::solana_program::program::invoke_signed(
            &transfer_instruction,
            &[
                from_account.to_account_info(),
                to_account.clone(),
                ctx.accounts.system_program.to_account_info(),
            ],
            &[]
        )?;

        Ok(())
    }

    // complete the txn by transferring the funds to the destination chain

    pub fn complete_txn(ctx: Context<CompleteTxn>, tx_id: String) -> Result<()> {
        let txn_data = &mut ctx.accounts.txn_data;
        txn_data.completed = true;

        let from_account = &ctx.accounts.txn_data.to_account_info();
        let to_account = ctx.accounts.creator.to_account_info();

        let transfer_instruction = anchor_lang::solana_program::system_instruction::transfer(
            from_account.key,
            to_account.key,
            txn_data.amount
        );

        // Invoke the transfer instruction

        anchor_lang::solana_program::program::invoke_signed(
            &transfer_instruction,
            &[from_account.clone(), to_account, ctx.accounts.system_program.to_account_info()],
            &[]
        )?;

        Ok(())
    }
}

#[derive(Accounts)]
pub struct Initialize<'info> {
    #[account(init, payer = creator, space = 8 + 8)]
    pub txn_counter: Account<'info, TxnCounter>,
    #[account(mut)]
    pub creator: Signer<'info>,
    /// CHECK: Safe
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
#[instruction(tx_id: String)]
pub struct CreatingTxn<'info> {
    #[account(mut)]
    pub creator: Signer<'info>,
    #[account(
        init,
        payer = creator,
        space = TxnData::size(),
        seeds = ["eclipse".as_bytes(), tx_id.as_bytes()],
        bump
    )]
    pub txn_data: Account<'info, TxnData>,
    pub txn_counter: Account<'info, TxnCounter>,
    /// CHECK: Safe
    pub system_program: AccountInfo<'info>,
}

#[derive(Accounts)]
#[instruction(tx_id: String)]
pub struct CompleteTxn<'info> {
    #[account(mut)]
    pub creator: Signer<'info>,
    #[account(
        mut,
        seeds = ["eclipse".as_bytes(), tx_id.as_bytes()],
        bump
    )]
    pub txn_data: Account<'info, TxnData>,
    /// CHECK: Safe
    pub system_program: AccountInfo<'info>,
}

#[account]
pub struct TxnData {
    pub tx_id: u64,
    pub from: Pubkey,
    pub to: Pubkey,
    pub amount: u64,
    pub completed: bool,
}

#[account]
pub struct TxnCounter {
    pub counter: u64,
}

const DISCRIMINATOR_LENGTH: usize = 8;
const PUBLIC_KEY_LENGTH: usize = 32;
const U64_LENGTH: usize = 8;

impl TxnData {
    pub fn size() -> usize {
        DISCRIMINATOR_LENGTH + // anchor discriminator
            U64_LENGTH + // tx_id
            PUBLIC_KEY_LENGTH * 2 + // from, to
            U64_LENGTH // amount
    }
}
