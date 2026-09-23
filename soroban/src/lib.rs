#![no_std]

use core::marker::PhantomData;
use soroban_sdk::token::Client as TokenClient;
use soroban_sdk::{
    contract, contracterror, contractimpl, contracttype, Address, Env, IntoVal, Symbol, Vec,
};

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

struct RegistryClient<'a> {
    env: Env,
    address: Address,
    _phantom: PhantomData<&'a ()>,
}

impl<'a> RegistryClient<'a> {
    fn new(env: &Env, address: &Address) -> Self {
        Self {
            env: env.clone(),
            address: address.clone(),
            _phantom: PhantomData,
        }
    }

    fn log_payment(&self, from: &Address, to: &Address, amount: &i128) -> PaymentRecord {
        let args = soroban_sdk::vec![
            &self.env,
            from.into_val(&self.env),
            to.into_val(&self.env),
            amount.into_val(&self.env),
        ];
        let func = Symbol::new(&self.env, "log_payment");
        self.env.invoke_contract(&self.address, &func, args)
    }
}

#[derive(Clone)]
#[contract]
pub struct PaymentContract;

#[contracttype]
#[derive(Clone)]
enum DataKey {
    Registry,
    Token,
    History(Address),
}

#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq)]
#[repr(u32)]
pub enum ContractError {
    AlreadyInitialized = 1,
    NotInitialized = 2,
    InvalidAmount = 3,
    SelfPayment = 4,
}

fn extend_instance_ttl(env: &Env) {
    env.storage()
        .instance()
        .extend_ttl(TTL_THRESHOLD, TTL_EXTEND_TO);
}

fn configured_address(env: &Env, key: &DataKey) -> Result<Address, ContractError> {
    env.storage()
        .instance()
        .get(key)
        .ok_or(ContractError::NotInitialized)
}

#[contractimpl]
impl PaymentContract {
    pub fn initialize(env: Env, registry: Address, token: Address) -> Result<(), ContractError> {
        if env.storage().instance().has(&DataKey::Registry) {
            return Err(ContractError::AlreadyInitialized);
        }
        env.storage().instance().set(&DataKey::Registry, &registry);
        env.storage().instance().set(&DataKey::Token, &token);
        extend_instance_ttl(&env);
        Ok(())
    }

    pub fn get_registry(env: Env) -> Result<Address, ContractError> {
        let registry = configured_address(&env, &DataKey::Registry)?;
        extend_instance_ttl(&env);
        Ok(registry)
    }

    pub fn get_token(env: Env) -> Result<Address, ContractError> {
        let token = configured_address(&env, &DataKey::Token)?;
        extend_instance_ttl(&env);
        Ok(token)
    }

    pub fn send_payment(
        env: Env,
        from: Address,
        to: Address,
        amount: i128,
    ) -> Result<(), ContractError> {
        from.require_auth();

        if from == to {
            return Err(ContractError::SelfPayment);
        }

        if amount <= 0 {
            return Err(ContractError::InvalidAmount);
        }

        let token_id = configured_address(&env, &DataKey::Token)?;
        let registry_id = configured_address(&env, &DataKey::Registry)?;
        extend_instance_ttl(&env);

        let token = TokenClient::new(&env, &token_id);
        token.transfer(&from, &to, &amount);

        let registry_client = RegistryClient::new(&env, &registry_id);
        let _ = registry_client.log_payment(&from, &to, &amount);

        let payment = PaymentRecord {
            from: from.clone(),
            to: to.clone(),
            amount,
            timestamp: env.ledger().timestamp(),
        };

        let mut history = env
            .storage()
            .persistent()
            .get(&DataKey::History(from.clone()))
            .unwrap_or_else(|| Vec::new(&env));
        history.push_back(payment.clone());
        let outbound_key = DataKey::History(from.clone());
        env.storage().persistent().set(&outbound_key, &history);
        env.storage()
            .persistent()
            .extend_ttl(&outbound_key, TTL_THRESHOLD, TTL_EXTEND_TO);

        let mut inbound = env
            .storage()
            .persistent()
            .get(&DataKey::History(to.clone()))
            .unwrap_or_else(|| Vec::new(&env));
        inbound.push_back(payment.clone());
        let inbound_key = DataKey::History(to.clone());
        env.storage().persistent().set(&inbound_key, &inbound);
        env.storage()
            .persistent()
            .extend_ttl(&inbound_key, TTL_THRESHOLD, TTL_EXTEND_TO);

        env.events().publish(
            (Symbol::new(&env, "payment"), from.clone(), to, amount),
            &payment,
        );
        Ok(())
    }

    pub fn get_payment_history(env: Env, address: Address) -> Vec<PaymentRecord> {
        extend_instance_ttl(&env);
        let key = DataKey::History(address);
        let history = env
            .storage()
            .persistent()
            .get(&key)
            .unwrap_or_else(|| Vec::new(&env));
        if env.storage().persistent().has(&key) {
            env.storage()
                .persistent()
                .extend_ttl(&key, TTL_THRESHOLD, TTL_EXTEND_TO);
        }
        history
    }
}

#[cfg(test)]
mod test {
    use super::*;
    use soroban_sdk::{
        testutils::{Address as _, MockAuth, MockAuthInvoke},
        token::StellarAssetClient,
        Env,
    };

    fn register_token(env: &Env) -> Address {
        let admin = Address::generate(env);
        env.register_stellar_asset_contract_v2(admin).address()
    }

    #[test]
    fn successful_payment_logs_and_emits_event() {
        let env = Env::default();
        env.mock_all_auths();

        let registry_id = env.register_contract(None, payment_registry::PaymentRegistryContract);
        let payment_id = env.register_contract(None, PaymentContract);
        let payment_client = PaymentContractClient::new(&env, &payment_id);
        let registry_client =
            payment_registry::PaymentRegistryContractClient::new(&env, &registry_id);

        let token_id = register_token(&env);
        payment_client.initialize(&registry_id, &token_id);

        let from = Address::generate(&env);
        let to = Address::generate(&env);
        let amount = 42_i128;
        let token = StellarAssetClient::new(&env, &token_id);
        token.mint(&from, &(amount + 100));

        payment_client.send_payment(&from, &to, &amount);

        let records = payment_client.get_payment_history(&from);
        assert_eq!(records.len(), 1);
        let record = records.get(0).unwrap();
        assert_eq!(record.from, from);
        assert_eq!(record.to, to);
        assert_eq!(record.amount, amount);
        assert_eq!(registry_client.get_payment_history(&from).len(), 1);
    }

    #[test]
    fn rejecting_zero_or_negative_amount_panics() {
        let env = Env::default();
        env.mock_all_auths();

        let registry_id = env.register_contract(None, payment_registry::PaymentRegistryContract);
        let payment_id = env.register_contract(None, PaymentContract);
        let payment_client = PaymentContractClient::new(&env, &payment_id);

        let token_id = register_token(&env);
        payment_client.initialize(&registry_id, &token_id);

        let from = Address::generate(&env);
        let to = Address::generate(&env);

        let res = payment_client.try_send_payment(&from, &to, &0_i128);
        assert!(res.is_err());
        let negative = payment_client.try_send_payment(&from, &to, &-1_i128);
        assert_eq!(negative, Err(Ok(ContractError::InvalidAmount)));
    }

    #[test]
    fn rejecting_self_transfer_panics() {
        let env = Env::default();
        env.mock_all_auths();

        let registry_id = env.register_contract(None, payment_registry::PaymentRegistryContract);
        let payment_id = env.register_contract(None, PaymentContract);
        let payment_client = PaymentContractClient::new(&env, &payment_id);

        let token_id = register_token(&env);
        payment_client.initialize(&registry_id, &token_id);

        let from = Address::generate(&env);
        let token = StellarAssetClient::new(&env, &token_id);
        token.mint(&from, &1000);

        let res = payment_client.try_send_payment(&from, &from, &7_i128);
        assert!(res.is_err());
    }

    #[test]
    fn registry_receives_the_logged_payment() {
        let env = Env::default();
        env.mock_all_auths();

        let registry_id = env.register_contract(None, payment_registry::PaymentRegistryContract);
        let payment_id = env.register_contract(None, PaymentContract);
        let payment_client = PaymentContractClient::new(&env, &payment_id);
        let registry_client =
            payment_registry::PaymentRegistryContractClient::new(&env, &registry_id);

        let token_id = register_token(&env);
        payment_client.initialize(&registry_id, &token_id);

        let from = Address::generate(&env);
        let to = Address::generate(&env);
        let token = StellarAssetClient::new(&env, &token_id);
        token.mint(&from, &1000);
        payment_client.send_payment(&from, &to, &7_i128);

        let records = registry_client.get_payment_history(&from);
        assert_eq!(records.len(), 1);
        let record = records.get(0).unwrap();
        assert_eq!(record.amount, 7_i128);
    }

    #[test]
    fn configuration_getters_and_missing_configuration_errors_are_defined() {
        let env = Env::default();
        let payment_id = env.register(PaymentContract, ());
        let payment_client = PaymentContractClient::new(&env, &payment_id);
        let from = Address::generate(&env);
        let to = Address::generate(&env);
        env.mock_all_auths();

        assert_eq!(
            payment_client.try_get_registry(),
            Err(Ok(ContractError::NotInitialized))
        );
        assert_eq!(
            payment_client.try_get_token(),
            Err(Ok(ContractError::NotInitialized))
        );
        assert_eq!(
            payment_client.try_send_payment(&from, &to, &1),
            Err(Ok(ContractError::NotInitialized))
        );

        let registry_id = env.register(payment_registry::PaymentRegistryContract, ());
        let token_id = register_token(&env);
        payment_client.initialize(&registry_id, &token_id);
        assert_eq!(payment_client.get_registry(), registry_id);
        assert_eq!(payment_client.get_token(), token_id);
        assert_eq!(
            payment_client.try_initialize(&registry_id, &token_id),
            Err(Ok(ContractError::AlreadyInitialized))
        );
    }

    #[test]
    fn normal_transfer_uses_exact_sender_authorization_and_updates_balances() {
        let env = Env::default();
        let registry_id = env.register(payment_registry::PaymentRegistryContract, ());
        let payment_id = env.register(PaymentContract, ());
        let payment_client = PaymentContractClient::new(&env, &payment_id);
        let registry_client =
            payment_registry::PaymentRegistryContractClient::new(&env, &registry_id);
        let token_id = register_token(&env);
        payment_client.initialize(&registry_id, &token_id);

        let from = Address::generate(&env);
        let to = Address::generate(&env);
        let amount = 1_000_000_i128;
        let asset = StellarAssetClient::new(&env, &token_id);
        env.mock_all_auths();
        asset.mint(&from, &(amount + 500));

        payment_client
            .mock_auths(&[MockAuth {
                address: &from,
                invoke: &MockAuthInvoke {
                    contract: &payment_id,
                    fn_name: "send_payment",
                    args: (&from, &to, amount).into_val(&env),
                    sub_invokes: &[MockAuthInvoke {
                        contract: &token_id,
                        fn_name: "transfer",
                        args: (&from, &to, amount).into_val(&env),
                        sub_invokes: &[],
                    }],
                },
            }])
            .send_payment(&from, &to, &amount);

        let token = TokenClient::new(&env, &token_id);
        assert_eq!(token.balance(&from), 500);
        assert_eq!(token.balance(&to), amount);
        assert_eq!(registry_client.get_payment_history(&from).len(), 1);
        assert_eq!(payment_client.get_payment_history(&from).len(), 1);
    }
}
