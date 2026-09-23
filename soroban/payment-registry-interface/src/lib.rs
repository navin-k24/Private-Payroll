#![no_std]

use soroban_sdk::{contracttype, Address, Env, String, Symbol, Vec};

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct PaymentRecord {
    pub from: Address,
    pub to: Address,
    pub amount: i128,
    pub timestamp: u64,
}

pub trait RegistryInterface {
    fn log_payment(env: Env, from: Address, to: Address, amount: i128) -> PaymentRecord;
    fn get_payment_history(env: Env, address: Address) -> Vec<PaymentRecord>;
}
