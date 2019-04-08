const AWS = require("aws-sdk");
const fs = require("fs");

const CHECK_WAIT_TIME_MS = 1000;

class StackSet {
  constructor(region, stackSetName, accountNumber) {
    this.region = region;
    this.name = stackSetName;
    this.accountNumber = accountNumber;
    this.cloudformation = new AWS.CloudFormation({ region: this.region });
    this.logger = require("./logger");
  }

  withTags(tags) {
    this.tags = this.processTags(tags);
    return this;
  }

  withAdminRole(role) {
    if (!role) role = "AWSCloudFormationStackSetAdministrationRole";
    const roleArn = `arn:aws:iam::${this.accountNumber}:role/${role}`;
    this.logger.info(`Admin role : ${roleArn}`);
    this.adminRoleArn = roleArn;
    return this;
  }

  withExecRole(role) {
    if (!role) role = "AWSCloudFormationStackSetExecutionRole";
    this.execRole = role;
    this.logger.info(`Exec role : ${role}`);
    return this;
  }

  async create(filePath) {
    this.body = await this.readFile(filePath);
    const params = {
      AdministrationRoleARN: this.adminRoleArn,
      Capabilities: ["CAPABILITY_NAMED_IAM"],
      ExecutionRoleName: this.execRole,
      StackSetName: this.name,
      TemplateBody: this.body,
      Tags: this.tags
    };
    const stackSet = await this.cloudformation
      .describeStackSet({
        StackSetName: this.name
      })
      .promise()
      .then(stackSet => stackSet.StackSet)
      .catch(err => undefined);

    let operationResponse;
    if (stackSet) {
      this.logger.startProgressiveLog("Update stackset");
      if (!this.isEqual(stackSet)) {
        operationResponse = await this.cloudformation
          .updateStackSet(params)
          .promise()
          .catch(err => {
            this.logger.stopProgressiveLog();
            this.logger.error(err.message);
          });
      } else {
        this.logger.stopProgressiveLog(" : no update to perform.");
        return;
      }
    } else {
      this.logger.startProgressiveLog("Create stackset");
      operationResponse = await this.cloudformation
        .createStackSet(params)
        .promise()
        .catch(err => {
          this.logger.stopProgressiveLog();
          this.logger.error(err.message);
        });
    }
    const operationId = operationResponse.OperationId;
    const operationStatus = await this.waitForOperation(operationId);
    this.logger.stopProgressiveLog();
    if (operationStatus == "FAILED") {
      this.logger.error(operationStatus);
    }
  }

  async delete() {
    const managedAccounts = await this.getManagedAccounts();
    if (managedAccounts.length > 0) {
      await this.deleteStackInstances();
    }
    return await this.cloudformation
      .deleteStackSet({
        StackSetName: this.name
      })
      .promise()
      .catch(err => {
        this.logger.error(err.message);
      });
  }

  async getStackInstances() {
    return await this.cloudformation
      .listStackInstances({ StackSetName: this.name })
      .promise();
  }

  // aws cloudformation list-stack-instances --stack-set-name $STACKSET_NAME --query Summaries[].[Account]
  async getManagedAccounts() {
    const stackInstances = await this.getStackInstances();
    const alreadyManagedAccounts = stackInstances.Summaries.map(instance => {
      return instance.Account;
    });
    return alreadyManagedAccounts;
  }

  async updateStackInstances(accounts, failureCount, maxConcurrentCount) {
    const alreadyManagedAccounts = await this.getManagedAccounts();
    this.logger.info("Current managed accounts : ");
    this.logger.info(alreadyManagedAccounts);
    const newAccountsToManage = accounts.filter(
      account => !alreadyManagedAccounts.includes(account)
    );
    let operationId;
    if (newAccountsToManage.length > 0) {
      this.logger.info("New accounts to manage : ");
      this.logger.info(JSON.stringify(newAccountsToManage, null, 2));
      this.logger.startProgressiveLog(`Creation of new stack instances`);
      // CLI version :
      // aws cloudformation create-stack-instances --stack-set-name $STACKSET_NAME --accounts '['$LIST_ACCOUNTS']' --regions '["'$AWS_REGIONS'"]' --operation-preferences FailureToleranceCount=$FAILURE_COUNT,MaxConcurrentCount=$MAX_CONCURRENT
      const operationResponse = await this.cloudformation
        .createStackInstances({
          Accounts: newAccountsToManage,
          OperationPreferences: {
            FailureToleranceCount: failureCount,
            MaxConcurrentCount: maxConcurrentCount
          },
          Regions: [this.region],
          StackSetName: this.name
        })
        .promise()
        .catch(e => {
          this.logger.error(e);
          return;
        });
      operationId = operationResponse.OperationId;
    } else {
      // TODO : check if it should not be done in every case
      this.logger.startProgressiveLog(`Update of existing stack instances`);
      this.logger.stopProgressiveLog(" - no update to perform");
      return ;
      /*
      // CLI version :
      // aws cloudformation create-stack-instances --stack-set-name $STACKSET_NAME --accounts '['$LIST_ACCOUNTS']' --regions '["'$AWS_REGIONS'"]' --operation-preferences FailureToleranceCount=$FAILURE_COUNT,MaxConcurrentCount=$MAX_CONCURRENT
      const operationResponse = await this.cloudformation
        .updateStackInstances({
          Accounts: alreadyManagedAccounts,
          OperationPreferences: {
            FailureToleranceCount: failureCount,
            MaxConcurrentCount: maxConcurrentCount
          },
          Regions: [this.region],
          StackSetName: this.name
        })
        .promise()
        .catch(e => {
          this.logger.error(e);
          return;
        });
      if (!operationResponse) {
        this.logger.stopProgressiveLog("in error");
        return;
      }
      operationId = operationResponse.OperationId;
      */
    }
    this.logger.debug(operationId);
    this.logger.updateProgressiveLog(`in progress (operation: ${operationId})`);

    // aws cloudformation describe-stack-set-operation --stack-set-name $STACKSET_NAME --operation-id $OPERATION_ID --query "StackSetOperation.Status"
    const operationStatus = await this.waitForOperation(operationId);
    this.logger.stopProgressiveLog();
    if (operationStatus == "FAILED") {
      this.logger.error(operationStatus);
    }
    return operationStatus;
  }

  async deleteStackInstances() {
    const managedAccounts = await this.getManagedAccounts();
    this.logger.startProgressiveLog(`Delete stack instances`);
    const operationResponse = await this.cloudformation
      .deleteStackInstances({
        Accounts: managedAccounts,
        Regions: [this.region],
        RetainStacks: false,
        StackSetName: this.name
      })
      .promise()
      .catch(err => {
        this.logger.error(err.message);
      });

    const operationId = operationResponse.OperationId;
    const operationStatus = await this.waitForOperation(operationId);
    this.logger.stopProgressiveLog();
    if (operationStatus == "FAILED") {
      logger.error(operationStatus);
      logger.error(operationStatus);
    }
  }

  async waitForOperation(operationId) {
    let operationStatus = "RUNNING";
    while (operationStatus == "RUNNING") {
      await this.sleep(CHECK_WAIT_TIME_MS);
      operationStatus = (await this.cloudformation
        .describeStackSetOperation({
          OperationId: operationId,
          StackSetName: this.name
        })
        .promise()
        .catch(e => {
          this.logger.stopProgressiveLog();
          this.logger.error(e);
          return "FAILED";
        })).StackSetOperation.Status;
    }
  }

  processTags(tags) {
    let cfnTags = [];
    if (tags) {
      cfnTags = tags.split(",").map(tag => {
        const kv = tag.split("=");
        return {
          Key: kv[0],
          Value: kv[1]
        };
      });
    }
    return cfnTags;
  }

  isEqual(stackSet) {
    let equal = true;
    if (this.adminRoleArn != stackSet.AdministrationRoleARN) {
      console.log("AdministrationRoleARN are different");
      equal = false;
    }
    if (this.execRole != stackSet.ExecutionRoleName) {
      console.log("ExecutionRoleName are different");
      equal = false;
    }
    if (this.body != stackSet.TemplateBody) {
      console.log("body are different");
      equal = false;
    }
    if (JSON.stringify(this.tags) != JSON.stringify(stackSet.Tags)) {
      console.log("tags are different");
      equal = false;
    }
    return equal;
  }

  readFile(path, opts = "utf8") {
    return new Promise((resolve, reject) => {
      fs.readFile(path, opts, (err, data) => {
        if (err) reject(err);
        else resolve(data);
      });
    });
  }

  sleep(ms) {
    //this.logger.print(".");
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
module.exports = StackSet;
