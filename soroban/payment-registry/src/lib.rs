#![no_std]

use soroban_sdk::{contract, contractimpl, contracttype, Address, Env, Symbol, Vec};

const TTL_THRESHOLD: u32 = 120_960;
const TTL_EXTEND_TO: u32 = 518_400;

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct PaymentRecord {
    pub from: Address,
    pub to: Address,
    pub amount: i128,
    pub timestamp: u64,
}

#[derive(Clone)]
#[contract]
pub struct PaymentRegistryContract;

#[contracttype]
#[derive(Clone)]
enum DataKey {
    History(Address),
}

#[contractimpl]
impl PaymentRegistryContract {
    pub fn log_payment(env: Env, from: Address, to: Address, amount: i128) -> PaymentRecord {
        let timestamp = env.ledger().timestamp();
        let payment = PaymentRecord {
            from: from.clone(),
            to: to.clone(),
            amount,
            timestamp,
        };

        let mut history = env
            .storage()
            .persistent()
            .get(&DataKey::History(from.clone()))
            .unwrap_or_else(|| Vec::new(&env));
        history.push_back(payment.clone());
        let key = DataKey::History(from.clone());
        env.storage().persistent().set(&key, &history);
        env.storage().persistent().extend_ttl(&key, TTL_THRESHOLD, TTL_EXTEND_TO);
        env.storage().instance().extend_ttl(TTL_THRESHOLD, TTL_EXTEND_TO);

        env.events().publish((Symbol::new(&env, "registry_payment"), from.clone(), to, amount), &payment);
        payment
    }

    pub fn get_payment_history(env: Env, address: Address) -> Vec<PaymentRecord> {
        env.storage().instance().extend_ttl(TTL_THRESHOLD, TTL_EXTEND_TO);
        let key = DataKey::History(address);
        let history = env.storage()
            .persistent()
            .get(&key)
            .unwrap_or_else(|| Vec::new(&env));
        if env.storage().persistent().has(&key) {
            env.storage().persistent().extend_ttl(&key, TTL_THRESHOLD, TTL_EXTEND_TO);
        }
        history
    }
}
