import axios from 'axios';

const username = 'sgiraz';
const apiUrl = `https://github.com/users/${username}/contributions`;

axios.get(apiUrl)
  .then((response: { data: any; }) => {
    const contributionGraph = response.data;
    // Do something with the contribution graph data

    console.log(contributionGraph);
  })
  .catch((error: any) => {
    console.error(error);
});

console.log("Hello World");
