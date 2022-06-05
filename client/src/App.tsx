import {Component, createSignal, For, onCleanup} from 'solid-js';
import {createClient, defaultExchanges, subscriptionExchange} from "@urql/core";
import {createClient as createWSClient} from "graphql-ws";
import {pipe, subscribe} from 'wonka';

const wsClient = createWSClient({
  url: 'ws://localhost:4000/graphql'
});

const client = createClient({
  url: 'http://localhost:4000/graphql',
  exchanges: [
    ...defaultExchanges,
    subscriptionExchange({
      forwardSubscription: (operation) => ({
        subscribe: (sink) => ({
          unsubscribe: wsClient.subscribe(operation, sink),
        }),
      }),
    }),
  ],
});

interface Todo {
  id: string;
  text: string;
  done: boolean;
}

type Todos = Array<Todo>;

const [todos, setTodos] = createSignal<Todos>([]);

const {unsubscribe} = pipe(
  client.subscription(`
    subscription TodosSub {
      todos {
        id
        text
        done
      }
    }
  `), subscribe((result) => setTodos(result.data?.todos))
)

const App: Component = () => {
  const [text, setText] = createSignal<string>("");

  onCleanup(unsubscribe);

  const toggle = async (id: string) => {
    await client.mutation(`
      mutation($id: ID!, $done: Boolean!) {
        setDone(id: $id, done: $done) {
          id
        }
      }
    `, {
      id,
      done: !todos()?.find(todo => todo.id === id)!.done
    }).toPromise()
  }

  const onAddClick = async () => {
    await client.mutation(`
      mutation($text: String!) {
        addTodo(text: $text) {
          id
        }
      }
    `,
      {
        text: text()
      }).toPromise();
    setText("");
  };

  return (
    <div>
      <For each={todos()}>
        {({id, done, text}) => (
          <div>
            <input type="checkbox" checked={done} onclick={() => toggle(id)}/>
            <span>{text}</span>
          </div>
        )}
      </For>
      <div>{text()}</div>
      <div>
        <input type="text" value={text()} oninput={(e) => setText(e.currentTarget.value)}/>
        <button onclick={onAddClick}>Add</button>
      </div>
    </div>
  );
};

export default App;
