const AWS = require("aws-sdk");

class StackSets {

  static async listStacksets(region) {
    const cloudformation = new AWS.CloudFormation({ region: region });
    return (await cloudformation.listStackSets().promise()).Summaries;
  }

}

module.exports = StackSets;
