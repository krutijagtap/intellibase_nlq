const cds = require('@sap/cds');
const { getDestination } = require('@sap-cloud-sdk/connectivity');
const axios = require("axios");
const { SELECT } = require('@sap/cds/lib/ql/cds-ql');

module.exports = cds.service.impl(async function () {
    const { PromptsData } = this.entities;
    // Return distinct categories
    this.on('DistinctCategories', async (req) => {
        const result = await SELECT.distinct
            .from(PromptsData)
            .columns("category");
        return result;
    });

    // Return distinct products (optionally filtered by category)
    this.on('DistinctProducts', async (req) => {
        const result = await SELECT.distinct
            .from(PromptsData)
            .columns("product");
        return result;
    });

    this.on('getPrompt', async (req) => {
        const { prompt } = req.data;

        const record = await SELECT.one.from(PromptsData).where({ prompt });
        if (!record) {
            req.error(404, `No prompt found with value: ${prompt}`);
        }
        return record;
    });

    this.on('getAPIResponse', async (req) => {
        const { prompt } = req.data;
        const user = req.user.id;
        const payload = { "message": "user_id:" + user + ":" + prompt };
        // const destination = await getDestination({ destinationName: "Treasurybackend" });

        // try{
        // const responseChat = await axios.post(`${destination.url}/api/approved-file-upload`, payload, {
        //             headers: {
        //               ...payload.getHeaders(),
        //               Authorization: `Bearer ${destination.authTokens?.[0]?.value}`,
        //             }
        //           });
        //           console.log("upload response:", responseChat)
        
        //           if (responseChat.status !== 200) {
        //             console.log("Failed to fetch response");
        //             return;
        //           }
        //     return responseChat;
        // }
        // catch(err){
        //     console.log("catch of API response", err)
        // }
    });
});
