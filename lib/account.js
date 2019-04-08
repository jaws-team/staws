const AWS = require("aws-sdk");

class Account {
  constructor(region) {
    this.region = region;
  }

  async getNumber() {
    const sts = new AWS.STS({ region: this.region });
    return sts
      .getCallerIdentity()
      .promise()
      .then(identity => {
        // console.log(identity);
        return identity.Account;
      })
      .catch(err => console.log(err));
  }
}
module.exports = Account;
