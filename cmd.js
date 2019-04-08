#!/usr/bin/env node
const Account = require("./lib/account");
const StackSets = require("./lib/stacksets");
const StackSet = require("./lib/stackset");
const package = require("./package.json");
const program = require("commander");
const logger = require("./lib/logger");

//
const region = process.env.AWS_REGION || "eu-west-1";
const DEFAULT_FAILURE_COUNT = 0;
const DEFAULT_MAX_CONCURRENT = 2;

//logger.header(package.name, package.description);

program.version(package.version).description(package.description);
program
  .command("create-stack-set")
  .description("Create a new Stackset.")
  .alias("css")
  .option("-s, --stackset-name <stackset>", "Stackset name")
  .option(
    "-f, --stackset-file <stackset_file>",
    "Local File containing the body of the Stackset"
  )
  .option(
    "-a, --admin-role [admin-role]",
    "StackSet Administration Role. Must exist in the Administration account.",
    "AWSCloudFormationStackSetAdministrationRole"
  )
  .option(
    "-e, --exec-role [exec-role]",
    "StackSet Execution Role. Must exist in each managed account. Defaults to 'AWSCloudFormationStackSetExecutionRole'",
    "AWSCloudFormationStackSetExecutionRole"
  )
  .option(
    "-t, --tags <tags>",
    "Tags of the Stackset. Format: key=value,key2=value2"
  )
  .action(createOrUpdateStackSet);
program
  .command("update-stack-set")
  .description("Update an existing Stackset.")
  .alias("uss")
  .option("-s, --stackset-name <stackset>", "Stackset name")
  .option(
    "-f, --stackset-file <stackset_file>",
    "Local File containing the body of the Stackset"
  )
  .option(
    "-a, --admin-role [admin-role]",
    "StackSet Administration Role. Must exist in the Administration account.",
    "AWSCloudFormationStackSetAdministrationRole"
  )
  .option(
    "-e, --exec-role [exec-role]",
    "StackSet Execution Role. Must exist in each managed account. Defaults to 'AWSCloudFormationStackSetExecutionRole'",
    "AWSCloudFormationStackSetExecutionRole"
  )
  .option(
    "-t, --tags <tags>",
    "Tags of the Stackset. Format: key=value,key2=value2"
  )
  .action(createOrUpdateStackSet);
program
  .command("delete-stack-set")
  .description("Delete an existing Stackset.")
  .alias("dss")
  .option("-s, --stackset-name <stackset>", "Stackset name")
  .action(deleteStackSet);
program
  .command("list-managed-accounts")
  .description(
    "List accounts managed by a Stackset (also named 'stack instances')."
  )
  .alias("lma")
  .option("-s, --stackset-name <stackset>", "Stackset name")
  .action(listManagedAccountsByStackSet);
program
  .command("list-stacksets")
  .description("List stacksets.")
  .alias("lss")
  .action(listStackSets);
program
  .command("register-stacks-instances")
  .description(
    "Register Stack instances. Stacks instances are based on registered accounts to be managed."
  )
  .alias("rsi")
  .option("-s, --stackset-name <stackset>", "Stackset name")
  .option(
    "-a, --accounts <failure_count>",
    "Accounts to be managed by the stackset"
  )
  .option(
    "-f, --failure-count [failure_count]",
    "Failure count",
    DEFAULT_FAILURE_COUNT
  )
  .option(
    "-m, --max-concurrent [max_concurrent]",
    "Max concurrent executions",
    DEFAULT_MAX_CONCURRENT
  )
  .action(registerStackInstances);

program.parse(process.argv);

// curiously required parameters are not checked by commander
function isRequired(key, name) {
  if (!key) {
    logger.error(`--${name} is required`);
    process.exit(1);
  }
  return key;
}

async function createOrUpdateStackSet(options) {
  const stacksetName = isRequired(options.stacksetName, "stackset-name");
  const stacksetFile = isRequired(options.stacksetFile, "stackset-file");
  const account = new Account(this.region);
  const accountNumber = await account.getNumber();
  const stackSet = new StackSet(region, stacksetName, accountNumber)
    .withTags(options.tags)
    .withAdminRole(options.adminRole)
    .withExecRole(options.execRole);
  const status = await stackSet.create(stacksetFile);
  console.log(status);
}

async function deleteStackSet(options) {
  const stacksetName = isRequired(options.stacksetName, "stackset-name");
  const stackSet = new StackSet(region, stacksetName);
  const status = await stackSet.delete();
  console.log(status);
}

async function listStackSets() {
  const stackSets = await StackSets.listStacksets(region);
  logger.log(`StackSets : `);
  stackSets.forEach(stackSet => {
    logger.log(
      `${stackSet.StackSetName} - ${stackSet.Status} - ${stackSet.StackSetId}`
    );
  });
}

async function registerStackInstances(options) {
  const stackSetName = isRequired(options.stacksetName, "stackset-name");
  const accountsToManage = isRequired(options.accounts, "accounts").split(",");
  const failure_count = options.failure_count;
  const max_concurrent = options.max_concurrent;
  const stackSet = new StackSet(region, stackSetName);
  await stackSet.updateStackInstances(
    accountsToManage,
    failure_count,
    max_concurrent
  );
}

async function listManagedAccountsByStackSet(options) {
  const stackSetName = isRequired(options.stacksetName, "stackset-name");
  const stackSet = new StackSet(region, stackSetName);
  const managedAccounts = await stackSet.getManagedAccounts();
  logger.log(`Managed accounts by StackSet ${stackSetName}: `);
  managedAccounts.forEach(account => {
    logger.log(account);
  });
}
